const { sendNewRequestEmails } = require('./emailService');

const mockPayload = {
    name: "Manny Test",
    email: "munelstg0@gmail.com",
    phone: "8095551234",
    propertyAddress: "123 Test St",
    projectTitle: "Cinematic Test",
    projectType: "Real Estate",
    desiredDate: "2026-04-01"
};

const mockProjectId = "VP-TEST-999";

console.log("Testing sendNewRequestEmails...");
sendNewRequestEmails(mockPayload, mockProjectId)
    .then(() => console.log("Form email test finished."))
    .catch(err => console.error("Form email test FAILED:", err));
