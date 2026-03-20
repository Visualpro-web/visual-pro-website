const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { LOGS_DIR } = require('./dataService');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.resend.com',
    port: process.env.SMTP_PORT || 465,
    auth: {
        user: process.env.SMTP_USER || 'resend',
        pass: process.env.SMTP_PASS
    }
});

const logEvent = (eventType, details) => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] EVENT: ${eventType} | DETAILS: ${JSON.stringify(details)}\n`;
    const logFile = path.join(LOGS_DIR, 'email-events.log');
    
    fs.appendFile(logFile, logEntry, (err) => {
        if (err) console.error('Failed to write to email log:', err);
    });
};

const sendEmail = async (to, subject, htmlBody, eventType, retries = 3) => {
    const mailOptions = {
        from: process.env.FROM_EMAIL || 'Visual Pro <onboarding@resend.dev>',
        to: to,
        subject: subject,
        html: htmlBody,
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const info = await transporter.sendMail(mailOptions);
            console.log(`Email sent successfully on attempt ${attempt}: ${info.messageId}`);
            logEvent(eventType, { to, subject, status: 'success', messageId: info.messageId });
            return true;
        } catch (error) {
            console.error(`Attempt ${attempt} to send email failed:`, error.message);
            if (attempt === retries) {
                logEvent(eventType, { to, subject, status: 'failed', error: error.message });
                console.error('All retries failed.');
                return false;
            }
            await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
    }
};

const wrapEmailTemplate = (content, projectId = null) => {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    return `
<!DOCTYPE html>
<html>
<head>
<style>
    @keyframes spin { 100% { transform: rotate(360deg); } }
    @keyframes popIn { 0% { transform: scale(0.5); opacity: 0; } 80% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 1;} }
    .clock { width: 50px; height: 50px; border: 3px solid #FFB000; border-radius: 50%; position: relative; margin: 30px auto; }
    .clock::before { content: ''; position: absolute; top: 10px; left: 23px; width: 3px; height: 15px; background: #FFB000; border-radius: 3px; transform-origin: bottom center; animation: spin 2s linear infinite; }
    .clock::after { content: ''; position: absolute; top: 23px; left: 23px; width: 15px; height: 3px; background: #FFB000; border-radius: 3px; transform-origin: left center; animation: spin 12s linear infinite; }
    .check-circle { width: 60px; height: 60px; border-radius: 50%; background: rgba(50, 215, 75, 0.1); border: 2px solid #32D74B; color: #32D74B; font-size: 32px; display: flex; align-items: center; justify-content: center; margin: 30px auto; animation: popIn 0.6s cubic-bezier(0.16, 1, 0.3, 1); text-align: center; line-height: 60px; }
    .completion-check { width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, rgba(255,123,0,0.1), rgba(255,176,0,0.1)); border: 3px solid #FFB000; color: #FFB000; font-size: 40px; display: flex; align-items: center; justify-content: center; margin: 40px auto; animation: popIn 0.8s cubic-bezier(0.16, 1, 0.3, 1); text-align: center; line-height: 80px; box-shadow: 0 0 30px rgba(255,123,0,0.3); }
    body, p, h1, h2 { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
</style>
</head>
<body style="margin: 0; padding: 0; background-color: #030303; color: #F5F5F7; -webkit-font-smoothing: antialiased;">
    <div style="padding: 50px 20px; line-height: 1.6;">
        <div style="max-width: 600px; margin: 0 auto; background: #0A0A0A; border: 1px solid rgba(255,255,255,0.05); border-radius: 20px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.8);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #FF7B00, #FFB000); padding: 35px; text-align: center;">
                <h1 style="margin: 0; color: #000; font-size: 32px; font-weight: 800; letter-spacing: -1.5px; text-transform: uppercase;">Visual Pro</h1>
            </div>
            <!-- Content -->
            <div style="padding: 45px 40px; text-align: center;">
                ${content}
                ${projectId ? `
                <div style="margin-top: 45px;">
                    <a href="${baseUrl}/track-project" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #FF7B00, #FFB000); color: #000; font-weight: 700; text-decoration: none; border-radius: 30px; font-size: 16px; box-shadow: 0 8px 20px rgba(255, 123, 0, 0.3);">Enter Client Portal</a>
                </div>` : ''}
            </div>
            <!-- Project ID Section -->
            ${projectId ? `
            <div style="background: rgba(255,123,0,0.03); border-top: 1px solid rgba(255,123,0,0.08); padding: 25px 30px; text-align: center;">
                <p style="margin: 0; font-size: 12px; color: #86868B; text-transform: uppercase; letter-spacing: 2px;">Project ID</p>
                <p style="margin: 8px 0 0 0; font-size: 26px; font-weight: 700; font-family: monospace; color: #FFB000; letter-spacing: 1px;">${projectId}</p>
            </div>` : ''}
            <!-- Footer -->
            <div style="background: #050505; padding: 40px 30px; text-align: center; border-top: 1px solid rgba(255,255,255,0.03);">
                <p style="margin: 0; font-weight: 600; color: #F5F5F7; font-size: 16px; letter-spacing: 1px;">Visual Pro</p>
                <p style="margin: 8px 0 0 0; font-size: 13px; color: #86868B;">Premium Cinematic Video Production</p>
            </div>
        </div>
    </div>
</body>
</html>
    `;
};

const sendNewRequestEmails = async (clientData, projectId) => {
    const adminEmail = process.env.ADMIN_EMAIL || 'munelstg0@gmail.com';
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    
    // Admin Notif
    const adminSubject = `New Request: ${clientData.name} – VP`;
    let adminContent = `
        <h2 style="margin-top:0; color:#fff;">New Project Request</h2>
        <div style="text-align: left; background: rgba(255,255,255,0.03); padding: 20px; border-radius: 12px; margin-top: 20px;">
            <p style="margin: 5px 0;"><strong>Client Name:</strong> ${clientData.name}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${clientData.email}</p>
            ${clientData.phone ? `<p style="margin: 5px 0;"><strong>Phone:</strong> ${clientData.phone}</p>` : ''}
            ${clientData.propertyAddress ? `<p style="margin: 5px 0;"><strong>Location:</strong> ${clientData.propertyAddress}</p>` : ''}
            ${clientData.projectTitle ? `<p style="margin: 5px 0;"><strong>Video Type:</strong> ${clientData.projectTitle}</p>` : ''}
            <p style="margin: 5px 0;"><strong>Status:</strong> Request Submitted</p>
        </div>
        <p style="margin-top: 30px;"><a href="${baseUrl}/admin-dashboard" style="color: #FFB000; text-decoration: none; font-weight: 600;">Open Dashboard &rarr;</a></p>
    `;

    // Client Confirmation
    const clientSubject = 'Request Submitted – Visual Pro';
    const clientContent = `
        <div class="clock"></div>
        <h2 style="margin-top:20px; font-size: 24px; color:#fff;">Hello ${clientData.name},</h2>
        <p style="font-size: 16px; color: #ccc;">We have received your project request for <strong>${clientData.propertyAddress || 'your property'}</strong>.</p>
        <p style="font-size: 16px; color: #ccc;">Our team is currently reviewing the details. You can track the live progress using the link below.</p>
    `;

    try {
        await Promise.all([
            sendEmail(adminEmail, adminSubject, wrapEmailTemplate(adminContent, projectId), 'request submitted (admin)'),
            sendEmail(clientData.email, clientSubject, wrapEmailTemplate(clientContent, projectId), 'request submitted (client)')
        ]);
    } catch (err) {
        console.error('Error sending emails:', err.message);
    }
};

const sendStatusUpdateEmail = async (clientData, newStatus) => {
    let subject = `Update: ${newStatus} – Visual Pro`;
    let content = `
        <h2 style="color:#fff;">Hello ${clientData.name},</h2>
        <p style="font-size: 16px; color: #ccc;">The status of your project at <strong>${clientData.propertyAddress || 'Visual Pro'}</strong> has been updated.</p>
        
        <div style="background: rgba(255,255,255,0.05); padding: 25px; border-radius: 16px; margin: 30px 0; border: 1px solid rgba(255,123,0,0.1); text-align: center;">
            <p style="margin: 0; font-size: 13px; color: #86868B; text-transform: uppercase; letter-spacing: 1px;">Current Status</p>
            <p style="margin: 10px 0 0 0; font-size: 24px; font-weight: 700; color: #FFB000;">${newStatus}</p>
        </div>
    `;

    // Custom UI/Logic for specific statuses
    if (newStatus === 'Project Accepted') {
        subject = 'Project Accepted – Next: Schedule Meeting';
        content += `
            <div class="check-circle">&#10003;</div>
            <p style="font-size: 16px; color: #ccc;">Your request has been <strong>Accepted</strong>. We are excited to work with you.</p>
            <p style="font-size: 16px; color: #ccc;">The next step is for us to schedule a brief meeting to finalize the details.</p>
        `;
    } else if (newStatus === 'Project Rejected') {
        subject = 'Update on your project request – Visual Pro';
        const reason = clientData.rejectionReason || 'Unfortunately, we cannot accept this project at this time.';
        content = `
            <h2 style="color:#fff;">Hello ${clientData.name},</h2>
            <p style="font-size: 16px; color: #ccc;">Your project request was not accepted at this time.</p>
            <div style="background: rgba(255,69,58,0.1); border: 1px solid rgba(255,69,58,0.2); padding: 20px; border-radius: 12px; margin: 20px 0; text-align: left;">
                <p style="margin: 0; font-size: 14px; color: #FF453A; font-weight: 600;">Details:</p>
                <p style="margin: 8px 0 0 0; font-size: 15px; color: #fff;">"${reason}"</p>
            </div>
        `;
    } else if (newStatus === 'Deposit Required') {
        subject = 'Action Required: Deposit Required – Visual Pro';
        content += `
            <p style="font-size: 16px; color: #ccc;">To officially start the project, a <strong>50% deposit</strong> is required.</p>
            <p style="font-size: 16px; color: #ccc;">Please visit your project dashboard to proceed with the secure payment.</p>
        `;
    } else if (newStatus === 'Project Started') {
        subject = 'Deposit Confirmed – Project Started!';
        content += `
            <div class="check-circle">&#10003;</div>
            <p style="font-size: 16px; color: #ccc;">Thank you for your payment. Your project is now <strong>Started</strong>.</p>
        `;
    } else if (newStatus === 'Final Payment Required') {
        subject = 'Action Required: Final Payment – Visual Pro';
        content += `
            <p style="font-size: 16px; color: #ccc;">Your project is ready! We just need the <strong>final balance</strong> to release the high-resolution files.</p>
        `;
    } else if (newStatus === 'Project Completed') {
        subject = 'Your Visual Pro Project is Complete';
        content = `
            <div class="completion-check">&#10004;</div>
            <h2 style="color:#fff;">Your project is complete!</h2>
            <p style="font-size: 16px; color: #ccc;">Thank you for choosing Visual Pro for your production needs.</p>
            <p style="font-size: 16px; color: #ccc;">All final files have been released and are ready for download in your portal.</p>
        `;
    }

    sendEmail(clientData.email, subject, wrapEmailTemplate(content, clientData.id), `status changed to ${newStatus}`);
};

/**
 * File Delivery Notification
 */
async function sendProjectDeliveryEmail(client, project) {
    const subject = `Your project is ready - Visual Pro`;
    const content = `
        <h2 style="color:#fff;">Hello ${client.name},</h2>
        <p style="font-size: 16px; color: #ccc;">Your project <strong>${project.projectTitle || project.id}</strong> has been completed and is ready for download.</p>
        <p style="font-size: 16px; color: #ccc;">You can access your files securely in your client portal.</p>
        <div style="margin: 30px 0;">
            <a href="${process.env.BASE_URL || 'https://visualpro.cloud-ip.cc'}/portal" style="display:inline-block; padding: 14px 28px; background: linear-gradient(135deg, #FF7B00, #FFB000); color: #000; font-weight: 600; text-decoration: none; border-radius: 20px; text-transform: uppercase; font-size: 14px; letter-spacing: 1px;">Access My Project</a>
        </div>
    `;

    sendEmail(client.email, subject, wrapEmailTemplate(content, project.id), 'Project Delivered');
}

module.exports = {
    sendNewRequestEmails,
    sendStatusUpdateEmail,
    sendProjectDeliveryEmail
};
