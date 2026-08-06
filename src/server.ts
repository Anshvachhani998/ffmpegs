import express, { Request, Response } from 'express';
import ffmpeg from 'fluent-ffmpeg';
import cors from 'cors';
import path from 'path';

const app = express();
app.use(express.json());
app.use(cors());

// Serve frontend HTML from 'public' folder
app.use(express.static(path.join(__dirname, '../public')));

// Helper function to fetch real filename and headers using HTTP HEAD request
const getHeadersAndFilename = async (fileUrl: string): Promise<{ fileName: string; headers: Record<string, string> }> => {
  const headersObj: Record<string, string> = {};
  
  try {
    const response = await fetch(fileUrl, { method: 'HEAD' });
    
    response.headers.forEach((value, key) => {
      headersObj[key] = value;
    });

    const disposition = response.headers.get('content-disposition');
    if (disposition) {
      const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (match && match[1]) {
        const extracted = decodeURIComponent(match[1].replace(/['"]/g, ""));
        return { fileName: extracted, headers: headersObj };
      }
    }
  } catch (err) {
    // Ignore network/head errors and fallback below
  }

  // Fallback: If headers don't have it, extract cleanly from URL pathname
  let fallbackName = "media_file";
  try {
    const parsed = new URL(fileUrl);
    const basename = parsed.pathname.split('/').pop();
    if (basename) {
      const decoded = decodeURIComponent(basename);
      fallbackName = decoded.replace(/^\d+-[a-zA-Z0-9]+-/, '');
    }
  } catch {}

  return { fileName: fallbackName, headers: headersObj };
};

// API Endpoint to check media link, return headers, and detect audio tracks
app.post('/api/check-media', async (req: Request, res: Response): Promise<void> => {
  const { url } = req.body;

  if (!url) {
    res.status(400).json({ 
      success: false, 
      error: 'URL is required' 
    });
    return;
  }

  // 1. Fetch headers and filename via HEAD request
  const { fileName, headers } = await getHeadersAndFilename(url);

  // 2. Use ffprobe to check validity and extract audio tracks
  ffmpeg.ffprobe(url, (err, metadata) => {
    if (err) {
      res.status(400).json({
        success: false,
        downloadable: false,
        fileName: fileName,
        headers: headers,
        error: 'Link is invalid, expired, or not accessible.',
        details: err.message
      });
      return;
    }

    // Audio tracks extract kar rahe hain (Language aur Title ke sath)
    const audioTracks = metadata.streams
      .filter((stream) => stream.codec_type === 'audio')
      .map((stream, index) => {
        return {
          trackId: stream.index,
          codec: stream.codec_name,
          language: stream.tags?.language || 'Unknown', // e.g., 'hin', 'eng'
          title: stream.tags?.title || `Track ${index + 1}`,
          channels: stream.channels // 2 for stereo, 6 for 5.1, etc.
        };
      });

    // Video information bhi nikal lete hain (Optional)
    const videoTracks = metadata.streams
      .filter((stream) => stream.codec_type === 'video')
      .map((stream) => stream.codec_name);

    // Response with detailed audio tracks included
    res.json({
      success: true,
      downloadable: true,
      fileName: fileName,
      mediaInfo: {
        totalAudioTracks: audioTracks.length,
        audioTracks: audioTracks,
        videoCodecs: videoTracks
      },
      headers: headers
    });
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
