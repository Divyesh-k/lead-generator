// Debug script to test payment order creation
// This will help identify what's causing the 500 error

const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');

console.log('=== Payment Debug Info ===');
console.log('RAZORPAY_KEY_ID:', process.env.RAZORPAY_KEY_ID ? 'Set (length: ' + process.env.RAZORPAY_KEY_ID.length + ')' : 'NOT SET');
console.log('RAZORPAY_KEY_SECRET:', process.env.RAZORPAY_KEY_SECRET ? 'Set (length: ' + process.env.RAZORPAY_KEY_SECRET.length + ')' : 'NOT SET');

try {
    const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    console.log('✓ Razorpay initialized successfully');
} catch (error) {
    console.log('✗ Razorpay initialization failed:', error.message);
}
console.log('==========================\n');
