const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Enable CORS
app.use(cors());

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' }); // Files will be saved to the 'uploads' directory

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


app.get('/data', async (req, res) => {
  try {
    const data = await getDataFromGoogleSheet();
    res.status(200).json(data);
  } catch (error) {
    console.error('Error sending data:', error);
    res.status(500).send('Error fetching data from Google Sheets');
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
    const imageUrl = await uploadToCloudStorage(file);

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
async function uploadToCloudStorage(file) {
  const drive = google.drive({ version: 'v3', auth });

  try {
    // Upload the file to Google Drive
    const res = await drive.files.create({
      requestBody: {
        name: file.originalname,
        mimeType: file.mimetype,
        parents: [FOLDER_ID], // Specify the folder ID
      },
      media: {
        mimeType: file.mimetype,
        body: fs.createReadStream(file.path),
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

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
