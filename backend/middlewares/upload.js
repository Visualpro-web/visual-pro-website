const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { AVATARS_DIR, DELIVERABLES_DIR, RECEIPTS_DIR } = require('../dataService');

// Configure Cloudinary only if the credentials are provided
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
}

const getStorage = () => {
    // Only use Cloudinary if MongoDB is connected (Production environment)
    if (process.env.MONGODB_URI && process.env.CLOUDINARY_CLOUD_NAME) {
        console.log('☁️ Using Cloudinary storage for uploads.');
        return new CloudinaryStorage({
            cloudinary: cloudinary,
            params: async (req, file) => {
                let folder = 'visualpro/deliverables';
                if (file.fieldname === 'profileImage') folder = 'visualpro/avatars';
                if (file.fieldname === 'paymentReceipt') folder = 'visualpro/receipts';
                return {
                    folder: folder,
                    resource_type: 'auto',
                };
            },
        });
    } else {
        console.log('📁 Using local disk storage for uploads (Memory Mode).');
        return multer.diskStorage({
            destination: function (req, file, cb) {
                if (file.fieldname === 'profileImage') {
                    if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });
                    cb(null, AVATARS_DIR);
                } else if (file.fieldname === 'paymentReceipt') {
                    // Assuming RECEIPTS_DIR exists in dataService or fallback
                    const dir = path.join(__dirname, '..', 'visualpro-data', 'projects', 'receipts');
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    cb(null, dir);
                } else {
                    if (!fs.existsSync(DELIVERABLES_DIR)) fs.mkdirSync(DELIVERABLES_DIR, { recursive: true });
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
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max limit
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'profileImage') {
            if (!file.mimetype.startsWith('image/')) {
                return cb(new Error('Only images are allowed for profile pictures!'), false);
            }
        }
        cb(null, true);
    }
});

module.exports = upload;
