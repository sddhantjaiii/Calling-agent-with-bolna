#!/usr/bin/env node

/**
 * Quick Voice API Structure Checker
 * Let's see what the actual /me/voices response looks like
 */

require('dotenv').config();
const axios = require('axios');

const BOLNA_API_KEY = process.env.BOLNA_API_KEY;
const BOLNA_BASE_URL = 'https://api.bolna.ai';

const bolnaClient = axios.create({
  baseURL: BOLNA_BASE_URL,
  headers: {
    'Authorization': `Bearer ${BOLNA_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

async function checkVoicesStructure() {
  try {
    console.log('🔍 Checking /me/voices endpoint structure...');
    
    const response = await bolnaClient.get('/me/voices');
    
    console.log('📊 Response Status:', response.status);
    console.log('📋 Response Headers:', response.headers['content-type']);
    console.log('📦 Response Data Type:', typeof response.data);
    console.log('📦 Response Data:', JSON.stringify(response.data, null, 2));
    
    if (Array.isArray(response.data)) {
      console.log('✅ Response is an array with', response.data.length, 'items');
      if (response.data.length > 0) {
        console.log('🎯 First voice structure:', JSON.stringify(response.data[0], null, 2));
      }
    } else if (typeof response.data === 'object' && response.data !== null) {
      console.log('📋 Response is an object with keys:', Object.keys(response.data));
      // Check if it has a voices property
      if ('voices' in response.data) {
        console.log('🎤 Found voices property:', JSON.stringify(response.data.voices, null, 2));
      }
    } else {
      console.log('❓ Unexpected response type');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.status, error.response?.data || error.message);
  }
}

checkVoicesStructure();