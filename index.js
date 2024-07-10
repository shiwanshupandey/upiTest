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

// Enable CORS for a specific origin
const allowedOrigins = [
  'https://upi-front-99pla48pc-shiwanshuanooppandeygmailcoms-projects.vercel.app',
  'https://upi-front.vercel.app/page2',
  'https://upi-front.vercel.app',
  'http://localhost:3000'
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }
}));

// Configure multer for file uploads
const upload = multer();
const { Readable } = require('stream');

const { GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, SPREADSHEET_ID, FOLDER_ID } = process.env;

const auth = new google.auth.JWT(
  GOOGLE_CLIENT_EMAIL,
  null,
  GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
);

const sheets = google.sheets({ version: 'v4', auth });

async function getDataFromGoogleSheet() {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1',
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

app.post('/', upload.single('file'), async (req, res) => {
  try {
    const formData = JSON.parse(req.body.formData);
    const file = req.file;

    console.log('Uploaded file:', file);
    const paymentModeString = formData.paymentMode.join(', ');

    const imageUrl = await uploadToCloudStorage(
      file.buffer,
      file.originalname,
      file.mimetype
    );

    const values = [
      [
        formData.name,
        formData.mobileNumber,
        formData.email,
        formData.correspondenceAddress,
        formData.permanentAddress,
        formData.educationalDetails,
        formData.totalJobExperience,
        // formData.paymentMode,
        paymentModeString,
        imageUrl,
        formData.birthdate
      ],
    ];

    const resource = {
      values,
    };

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      resource,
    });
    console.log('Response from Sheets API:', response);

    res.status(200).json({ imageUrl });
  } catch (error) {
    console.error('Error sending data to Google Sheets:', error.response?.data || error.message);
    res.status(500).send('Error sending data to Google Sheets');
  }
});

async function uploadToCloudStorage(fileBuffer, fileName, mimeType) {
  const drive = google.drive({ version: 'v3', auth });

  try {
    const stream = new Readable();
    stream.push(fileBuffer);
    stream.push(null);

    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: mimeType,
        parents: [FOLDER_ID],
      },
      media: {
        mimeType: mimeType,
        body: stream,
      },
    });

    const fileId = res.data.id;
    const imageUrl = `https://drive.google.com/uc?id=${fileId}`;
    return imageUrl;
  } catch (error) {
    console.error('Error uploading file to Google Drive:', error.message);
    throw error;
  }
}

// Start the server
app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on port ${process.env.PORT || 3000}`);
});
