// S3 API setup for image uploads and downloads
const AWS = require('aws-sdk');
// Set the region 
AWS.config.update({region: 'eu-west-2'});
const s3 = new AWS.S3({apiVersion: '2006-03-01'})

// Create and export S3 service object
module.exports = {
  s3: 
}