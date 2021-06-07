module.exports = ({ env }) => {
  const adminUrl = env('URL', 'http://localhost:1337');

  const frontendHost = env("FRONTEND_HOST", "http://localhost");
  const frontendPort = env.int("FRONTEND_PORT", 3000);
  const frontendUrl = frontendPort !== 80 ? `${frontendHost}:${frontendPort}` : frontendHost;

  const previewHost = env("PREVIEW_HOST", "http://localhost");
  const previewPort = env.int("PREVIEW_PORT", 3000);
  const previewUrl = previewPort !== 80 ? `${previewHost}:${previewPort}` : previewHost;

  const origin = [adminUrl, frontendUrl, previewUrl]

  if (env('NODE_ENV') === 'development') {
    origin.push('http://localhost:1337');
  }
  
  return {
    settings: {
      cors: {
        origin
      },
    },
  };
};
