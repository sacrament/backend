/**
 * AWS Services Module
 * 
 * Exports AWS-related services:
 * - S3Service: File uploads and downloads
 * - APIGatewayService: API Gateway integration
 */

const S3Service = require('./s3.service');
const APIGatewayService = require('./api.gateway');

module.exports = {
  S3Service,
  APIGatewayService,
};
