export default async function(params) {
  return {
    message: "Hello, " + params.name + "!",
    timestamp: new Date().toISOString()
  };
}
