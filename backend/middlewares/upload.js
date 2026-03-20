const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { AVATARS_DIR, DELIVERABLES_DIR } = require('../dataService');

// Configure Cloudinary only if the credentials are provided
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
}

const getStorage = () => {
    if (process.env.CLOUDINARY_CLOUD_NAME) {
        return new CloudinaryStorage({
            cloudinary: cloudinary,
            params: async (req, file) => {
                // Cloudinary folder structure
                const folder = file.fieldname === 'profileImage' ? 'visualpro/avatars' : 'visualpro/deliverables';
                return {
                    folder: folder,
                    resource_type: 'auto', // Handles images, videos, raw files naturally
                };
            },
        });
    } else {
        // Fallback to local disk storage if no Cloudinary keys
        return multer.diskStorage({
            destination: function (req, file, cb) {
                if (file.fieldname === 'profileImage') {
                    cb(null, AVATARS_DIR);
                } else {
                    cb(null, DELIVERABLES_DIR);
                }
            },
            filename: function (req, file, cb) {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
            }
        });
    }
};

const upload = multer({ 
    storage: getStorage(),
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB max limit
});

module.exports = upload;
