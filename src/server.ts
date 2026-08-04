import express, { Request, Response } from 'express';
import ffmpeg from 'fluent-ffmpeg';
import cors from 'cors';
import path from 'path';

const app = express();
app.use(express.json());
app.use(cors());

// Serve frontend HTML from 'public' folder
app.use(express.static(path.join(__dirname, '../public')));

// API Endpoint to check media link
app.post('/api/check-media', async (req: Request, res: Response): Promise<void> => {
  const { url } = req.body;

  if (!url) {
    res.status(400).json({ 
      success: false, 
      error: 'URL is required' 
    });
    return;
  }

  // Directly running ffprobe without forcing outdated static paths
  ffmpeg.ffprobe(url, (err, metadata) => {
    if (err) {
      res.status(400).json({
        success: false,
        downloadable: false,
        error: 'Link is invalid, expired, or not accessible.',
        details: err.message
      });
      return;
    }

    res.json({
      success: true,
      downloadable: true,
      formatName: metadata.format.format_name,
      durationSeconds: metadata.format.duration,
      fileSize: metadata.format.size || 'Unknown',
      bitrate: metadata.format.bit_rate,
      streams: metadata.streams.map((stream: any) => ({
        type: stream.codec_type,
        codec: stream.codec_name,
        resolution: stream.width && stream.height ? `${stream.width}x${stream.height}` : null,
        sampleRate: stream.sample_rate || null
      }))
    });
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
