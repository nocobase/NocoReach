// Independent fake process; stdin/stdout JSON. No credentials, shell tools or network.
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  const request = JSON.parse(input);
  process.stdout.write(JSON.stringify({ request, content: `echo: ${request.prompt}`, exitCode: 0 }) + '\n');
});
