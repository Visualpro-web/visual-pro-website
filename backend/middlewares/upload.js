const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { AVATARS_DIR, DELIVERABLES_DIR } = require('../dataService');

const storage = multer.diskStorage({
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

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB max limit
});

module.exports = upload;
