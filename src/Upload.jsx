import React, { useState } from 'react';

const UploadForm = (props) => {
  const [file, setFile] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = () => {
    if (file) {
      const formData = new FormData();
      formData.append('file', file);

      fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
        .then((response) => response.json())
        .then((data) => {
          console.log('File uploaded successfully. URL:', data.url);
          fetch('/api/detect', {
            method: 'POST',
            credentials: 'include'
          })
          .then(res => res.json())
          .then(res => {
            props.setSongTitle(res.track.title);
            props.setUploadFinished(true);
          })
        })
        .catch((error) => {
          console.error('Error uploading file:', error);
        });
    }
  };

  return (
    <div>
      <input type="file" onChange={handleFileChange} />
      <button onClick={handleUpload}>Upload</button>
    </div>
  );
};

export default UploadForm;
