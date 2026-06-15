function greet(name = 'World') {
  return `Hello, ${name}!`;
}

function main() {
  console.log(greet(process.env.NAME));
}

if (require.main === module) {
  main();
}

module.exports = { greet };
