export default async function(params) {
  return {
    message: "Hello, " + (params.name || "stranger") + "!",
    timestamp: new Date().toISOString()
  };
}
