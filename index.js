const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Enable CORS
app.use(cors());

// Configure multer for file uploads
const upload = multer(); // Files will be stored in memory instead of disk
const { Readable } = require('stream');

// Load Google Sheets API credentials from environment variables
const { GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, SPREADSHEET_ID, FOLDER_ID } = process.env;

// Set up JWT auth
const auth = new google.auth.JWT(
  GOOGLE_CLIENT_EMAIL,
  null,
  GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
);

// Create Google Sheets API client
const sheets = google.sheets({ version: 'v4', auth });

async function getDataFromGoogleSheet() {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID, // Replace with your Google Sheets ID
      range: 'Sheet1', // Specify the range from which you want to fetch data
    });

    const rows = response.data.values;
    if (rows.length === 0) {
      console.log('No data found.');
      return [];
    } else {
      const data = rows.map(row => ({
        name: row[0],
        mobileNumber: row[1],
        email: row[2],
        correspondenceAddress: row[3],
        permanentAddress: row[4],
        educationalDetails: row[5],
        totalJobExperience: row[6],
        paymentMode: row[7],
        imageUrl: row[8],
        birthdate: row[9]
      }));
      return data;
    }
  } catch (error) {
    console.error('Error fetching data from Google Sheets:', error);
    throw error;
  }
}

app.get('/', async (req, res) => {
  try {
    const data = await getDataFromGoogleSheet();
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Error fetching data from Google Sheets' });
  }
});

// Endpoint to handle form data and send to Google Sheets
app.post('/', upload.single('file'), async (req, res) => {
  try {
    const formData = JSON.parse(req.body.formData); // Parse the formData from JSON string
    const file = req.file;

    // Log the file information
    console.log('Uploaded file:', file);

    // Upload the file to cloud storage (e.g., Google Drive) and obtain the URL
    const imageUrl = await uploadToCloudStorage(
      file.buffer, // Pass file buffer directly
      file.originalname,
      file.mimetype
    );

    // Prepare the data to be inserted into the Google Sheet
    const values = [
      [
        formData.name,
        formData.mobileNumber,
        formData.email,
        formData.correspondenceAddress,
        formData.permanentAddress,
        formData.educationalDetails,
        formData.totalJobExperience,
        formData.paymentMode,
        imageUrl,
        formData.birthdate
      ],
    ];

    const resource = {
      values,
    };

    // Send data to Google Sheets
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID, // Replace with your Google Sheets ID
      range: 'Sheet1!A1', // Ensure this range is correct and corresponds to your sheet
      valueInputOption: 'RAW',
      resource,
    });
    console.log('Response from Sheets API:', response);

    // Send the image URL in the response
    res.status(200).json({ imageUrl });
  } catch (error) {
    console.error('Error sending data to Google Sheets:', error.response?.data || error.message);
    res.status(500).send('Error sending data to Google Sheets');
  }
});

// Function to upload the file to Google Drive and get the URL
async function uploadToCloudStorage(fileBuffer, fileName, mimeType) {
  const drive = google.drive({ version: 'v3', auth });

  try {
    // Create a readable stream from the file buffer
    const stream = new Readable();
    stream.push(fileBuffer);
    stream.push(null);

    // Upload the file to Google Drive
    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: mimeType,
        parents: [FOLDER_ID], // Specify the folder ID
      },
      media: {
        mimeType: mimeType,
        body: stream, // Use the readable stream
      },
    });

    // Get the URL of the uploaded file
    const fileId = res.data.id;
    const imageUrl = `https://drive.google.com/uc?id=${fileId}`;
    return imageUrl;
  } catch (error) {
    console.error('Error uploading file to Google Drive:', error.message);
    throw error;
  }
}

// Start the server without specifying the port
app.listen(() => {
  console.log(`Server running`);
});
