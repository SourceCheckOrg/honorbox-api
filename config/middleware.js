module.exports = ({ env }) => {
  const adminUrl = env('URL', 'http://localhost:1337');
  const frontendUrl = env("FRONTEND_URL", "http://localhost:3000");
  const profileUrl = env("PROFILE_URL", "http://localhost:3001");
  const previewUrl = env("PREVIEW_URL", "http://localhost:3002");

  const origin = [adminUrl, frontendUrl, profileUrl, previewUrl]

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
