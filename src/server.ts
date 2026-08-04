import express, { Request, Response } from 'express';
import ffmpeg from 'fluent-ffmpeg';
import cors from 'cors';
import path from 'path';

const app = express();
app.use(express.json());
app.use(cors());

// Serve frontend HTML from 'public' folder
app.use(express.static(path.join(__dirname, '../public')));

// Helper function to fetch real filename using HTTP HEAD request from headers
const getFilenameFromHeaders = async (fileUrl: string): Promise<string> => {
  try {
    // Send a lightweight HEAD request to get headers without downloading the file
    const response = await fetch(fileUrl, { method: 'HEAD' });
    const disposition = response.headers.get('content-disposition');
    
    if (disposition) {
      const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (match && match[1]) {
        return decodeURIComponent(match[1].replace(/['"]/g, ""));
      }
    }
  } catch (err) {
    // Ignore network/head errors and fallback below
  }

  // Fallback: If headers don't have it, extract cleanly from URL pathname
  try {
    const parsed = new URL(fileUrl);
    const basename = parsed.pathname.split('/').pop();
    if (basename) {
      const decoded = decodeURIComponent(basename);
      // Clean up any R2 random hashes if they are in the path filename
      return decoded.replace(/^\d+-[a-zA-Z0-9]+-/, '');
    }
  } catch {}

  return "media_file";
};

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

  // 1. Get the actual filename from HEAD headers first
  const extractedFileName = await getFilenameFromHeaders(url);

  // 2. Run ffprobe for technical metadata
  ffmpeg.ffprobe(url, (err, metadata) => {
    if (err) {
      res.status(400).json({
        success: false,
        downloadable: false,
        fileName: extractedFileName,
        error: 'Link is invalid, expired, or not accessible.',
        details: err.message
      });
      return;
    }

    res.json({
      success: true,
      downloadable: true,
      fileName: extractedFileName,
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
