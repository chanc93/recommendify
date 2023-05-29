import React, { useState, useEffect } from 'react';
import WebPlayback from './WebPlayback'
import Login from './Login'
import './App.css';
import UploadForm from './Upload';

function App() {

  const [token, setToken] = useState('');
  const [uploadFinished, setUploadFinished] = useState(false);
  const [songTitle, setSongTitle] = useState('');

  useEffect(() => {

    async function getToken() {
      const response = await fetch('/auth/token');
      const json = await response.json();
      setToken(json.access_token);
    }

    getToken();

  }, []);

  return (
    <>
        { (token === '') ? <Login/> : <UploadForm setUploadFinished={setUploadFinished} setSongTitle={setSongTitle}/> }
        { ( uploadFinished === true ) ? <WebPlayback token={token} songTitle={songTitle} /> : null}
    </>
  );
}


export default App;
