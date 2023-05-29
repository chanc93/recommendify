const express = require('express')
const request = require('request');
const dotenv = require('dotenv');
const multer = require('multer');
// Load the SDK for JavaScript
var AWS = require('aws-sdk');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const fs = require('fs');
var cookies = require("cookie-parser");


const port = 5001

global.access_token = ''

dotenv.config()

var spotify_client_id = process.env.SPOTIFY_CLIENT_ID
var spotify_client_secret = process.env.SPOTIFY_CLIENT_SECRET

var spotify_redirect_uri = 'http://localhost:3000/auth/callback'

var generateRandomString = function (length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'video/quicktime') {
      return cb(new Error('Only .mov files are allowed'));
    }
    cb(null, true);
  },
});

async function getSeedSongId(access_token, songName) {
  try {
    const response = await axios.get(`${process.env.SPOTIFY_BASE}/search`, {
      params: {
        q: `track:${songName}`,
        type: 'track',
        limit: 1
      },
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      }
    });

    const trackResults = response.data.tracks.items;
    if (trackResults.length > 0) {
      const seedSongId = trackResults[0].id;
      return seedSongId;
    } else {
      console.log('No tracks found for the given song name.');
      return null;
    }
  } catch (error) {
    console.error('Error searching for the song:', error.message);
    return null;
  }
}

var app = express();

app.use(cookies());

app.get('/auth/login', (req, res) => {

  var scope = "streaming user-read-email user-read-private"
  var state = generateRandomString(16);

  var auth_query_parameters = new URLSearchParams({
    response_type: "code",
    client_id: spotify_client_id,
    scope: scope,
    redirect_uri: spotify_redirect_uri,
    state: state
  })

  res.redirect('https://accounts.spotify.com/authorize/?' + auth_query_parameters.toString());
})

app.get('/auth/callback', (req, res) => {

  var code = req.query.code;

  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    form: {
      code: code,
      redirect_uri: spotify_redirect_uri,
      grant_type: 'authorization_code'
    },
    headers: {
      'Authorization': 'Basic ' + (Buffer.from(spotify_client_id + ':' + spotify_client_secret).toString('base64')),
      'Content-Type' : 'application/x-www-form-urlencoded'
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      access_token = body.access_token;
      res.redirect('/')
    }
  });

})

app.get('/auth/token', (req, res) => {
  res.cookie('access_token', access_token, { httpOnly: true })
  res.json({ access_token: access_token})
})

app.post('/api/detect', async (req, res) => {
  function getByteArray(filePath){
      let fileData = fs.readFileSync(filePath);
      return fileData;
  }
  
  let result = getByteArray('/Users/ChristopherChan/Downloads/output.raw');
  let data = Buffer.from(result).toString('base64');

  const options = {
      method: 'POST',
      url: `https://${process.env.SHAZAM_HOST}/songs/v2/detect`,
      params: {
        timezone: `${process.env.TIMEZONE}`,
        locale: `${process.env.LOCALE}`
      },
      headers: {
        'content-type': 'text/plain',
        'X-RapidAPI-Key': `${process.env.SHAZAM_API_KEY}`,
        'X-RapidAPI-Host': `${process.env.SHAZAM_HOST}`
      },
      data: data
    };

    try {
          const response = await axios.request(options);
          return res.json(response.data);
          // res.send(response.data)
    } catch (error) {
        console.error(error);
    }
})

app.get('/api/generate-playlist', async (req, res) => {
  const access_token = req.cookies.access_token;
  const id = await getSeedSongId(access_token, req.query.song_title);

  try {
     // Step 1: Get track details of the seed song
     const seedSongResponse = await axios.get(`${process.env.SPOTIFY_BASE}/tracks/${id}`, {
       headers: {
         'Authorization': `Bearer ${access_token}`,
         'Content-Type': 'application/json'
       }
     });
 
     const seedSongDetails = seedSongResponse.data;
 
     // Step 2: Get recommended tracks based on the seed song
     const recommendationsResponse = await axios.get(`${process.env.SPOTIFY_BASE}/recommendations`, {
       params: {
         seed_tracks: id,
         limit: 5 // Number of recommended tracks you want to include in the playlist
       },
       headers: {
         'Authorization': `Bearer ${access_token}`,
         'Content-Type': 'application/json'
       }
     });
 
     const recommendedTracks = recommendationsResponse.data.tracks;
 
     // Step 3: Create a response object with the recommended tracks
     const playlist = {
       seedSong: seedSongDetails,
       recommendedTracks: recommendedTracks
     }; 
     res.json(playlist);
   } catch (error) {
     console.error('Error generating playlist:', error.message);
     res.status(500).json({ error: 'Internal Server Error' });
   } 
})

app.post('/api/upload', upload.single('file'), (req, res, next) => {
  // const file = req.file
  const file = req.file;

  if (!file) {
    const error = new Error('Please upload a file');
    error.statusCode = 400;
    return next(error);
  }

  const params = {
    Bucket: 'mymusicbucket',
    Key: file.originalname,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  function extractAudio(inputFilePath) {
      const outputFilePath = '/Users/ChristopherChan/Downloads/output.raw';
      const outputOptions = [
          '-f s16le',
          '-c:a pcm_s16le',
          '-ar 44100',
          '-ac 1'
        ];
        
      ffmpeg(inputFilePath)
      .outputOptions(outputOptions)
      .on('end', () => {
          console.log('Conversion complete');
      })
      .on('error', (err) => {
          console.error('Error:', err.message);
      })
      .save(outputFilePath);
  }

  s3.upload(params, (err, data) => {
    if (err) {
      return next(err);
    }
    extractAudio(data.Location);
    res.json({ url: data.Location });
  });
});


app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`)
})
