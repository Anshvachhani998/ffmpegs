import express, { Request, Response } from 'express';
import ffmpeg from 'fluent-ffmpeg';
import cors from 'cors';
import path from 'path';

const app = express();
app.use(express.json());
app.use(cors());

// Serve frontend HTML from 'public' folder
app.use(express.static(path.join(__dirname, '../public')));

// Helper function to extract filename from URL safely
const getFilenameFromUrl = (fileUrl: string): string => {
  try {
    const parsed = new URL(fileUrl);
    
    // 1. Check if content-disposition exists in query params (common for R2/S3 pre-signed URLs)
    const disp = parsed.searchParams.get("response-content-disposition");
    if (disp) {
      const match = disp.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (match && match[1]) {
        return decodeURIComponent(match[1].replace(/['"]/g, ""));
      }
    }
    
    // 2. Fallback to the last part of the URL pathname
    const pathname = parsed.pathname;
    const basename = pathname.split('/').pop();
    return basename ? decodeURIComponent(basename) : "media_file";
  } catch {
    return "media_file";
  }
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

  // Extract filename beforehand using the helper
  const extractedFileName = getFilenameFromUrl(url);

  // Directly running ffprobe without forcing outdated static paths
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
