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

module.exports = AWSUploadService;