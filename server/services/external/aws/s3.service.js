const fs = require('fs');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const config = require('../../../utils/config');
// const utils = require('../../utils');

const multerS3 = require('multer-s3');

const s3Client = new S3Client({
    region: config.AWS.REGION || 'us-east-1',
    credentials: {
        accessKeyId: config.AWS.ACCESS_KEY_ID,
        secretAccessKey: config.AWS.SECRET_ACCESS_KEY
    }
});

class AWSUploadService {
    constructor() {}

    async uploadMedia(file, name) {
        return uploadFile(file, name);
    }

    async deleteMedia(mediaId) {
        return deleteMedia(mediaId)
    }
}

/**
 * Upload a media file to AWS S3
 *
 * @param {*} file
 * @param {*} fileName
 */
const uploadFile = async (file, name) => {
    try {
        const fileBytes = file.buffer;
        const fileName = name || file.originalname;

        // Setting up S3 upload parameters
        const command = new PutObjectCommand({
            Bucket: config.AWS.BUCKET_NAME,
            Key: fileName,
            Body: fileBytes
        });

        const response = await s3Client.send(command);
        const url = `https://${config.AWS.BUCKET_NAME}.s3.${config.AWS.REGION || 'us-east-1'}.amazonaws.com/${fileName}`;
        
        console.log(`File uploaded successfully. ${url}`);
        
        return {
            Location: url,
            Key: fileName,
            Bucket: config.AWS.BUCKET_NAME
        };
    } catch (ex) {
        throw ex;
    }
};

/**
 * Delete a media file from AWS S3
 *
 * @param {*} mediaId
 * @returns
 */
const deleteMedia = async (mediaId) => {
    try {
        const command = new DeleteObjectCommand({
            Bucket: config.AWS.BUCKET_NAME,
            Key: mediaId
        });

        await s3Client.send(command);
        
        console.log(`File deleted successfully. ${mediaId}`);
        
        return {
            deleted: true,
            mediaId: mediaId
        };
    } catch (ex) {
        return {
            deleted: false,
            mediaId: mediaId,
            error: ex.message
        };
    }
}

/**
 * Bucket and key of an S3 object from its URL. Handles path-style
 * (https://s3.amazonaws.com/<bucket>/<key>, s3.<region>.amazonaws.com/...) and
 * virtual-hosted (https://<bucket>.s3.<region>.amazonaws.com/<key>) URLs; any query
 * string (presigned URLs) is ignored. Returns null for anything else.
 */
const s3ObjectFromUrl = (url) => {
    let parsed;
    try { parsed = new URL(String(url)); } catch { return null; }
    const host = parsed.hostname;
    const path = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    if (!path) return null;
    const virtual = host.match(/^(.+)\.s3[.-][a-z0-9.-]*amazonaws\.com$/) || host.match(/^(.+)\.s3\.amazonaws\.com$/);
    if (virtual) return { bucket: virtual[1], key: path };
    if (/^s3[.-]([a-z0-9-]+\.)?amazonaws\.com$/.test(host) || host === 's3.amazonaws.com') {
        const slash = path.indexOf('/');
        if (slash <= 0) return null;
        return { bucket: path.slice(0, slash), key: path.slice(slash + 1) };
    }
    return null;
};

/**
 * Delete the S3 object an URL points at, in the bucket named by the URL. Resolves
 * { deleted, bucket, key } and never throws; `deleted: false` with a reason
 * otherwise.
 */
const deleteObjectAtUrl = async (url) => {
    const target = s3ObjectFromUrl(url);
    if (!target) return { deleted: false, reason: 'not an S3 URL' };
    try {
        await s3Client.send(new DeleteObjectCommand({ Bucket: target.bucket, Key: target.key }));
        return { deleted: true, ...target };
    } catch (ex) {
        return { deleted: false, ...target, reason: ex.message };
    }
};

module.exports = AWSUploadService;
// Named helpers. account.deletion.service imported `{ deleteMedia }`, which the class
// export never provided, so it was undefined and avatars were never deleted.
module.exports.deleteMedia = deleteMedia;
module.exports.s3ObjectFromUrl = s3ObjectFromUrl;
module.exports.deleteObjectAtUrl = deleteObjectAtUrl;