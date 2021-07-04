const glob = require("glob");
const path = require("path");
const fs = require("fs");
const jsc = require("jscodeshift");
const flowParser = require("jscodeshift/parser/flow");
const {convert} = require('@khanacademy/flow-to-ts/dist/convert.bundle');

const files = glob.sync("src/**/*.js", {
  root: "./",
  ignore: ["src/**/__tests__/*.js"]
});

files.forEach(file => {
  const outFile = `./tmp-ts/${file.replace('.js', '.ts')}`
  const outPath = path.dirname(outFile)

  console.log(`Processing: ${file} -> ${outFile}`)

  const flowCode = fs.readFileSync(file, "utf-8");

  const ast = jsc(flowCode, {
    parser: flowParser()
  });

  ast
    .find(jsc.GenericTypeAnnotation, {
      id: { name: "TimeoutID" }
    })
    .replaceWith("number");

  const transformedCode = ast.toSource();

  const typescriptCode = convert(transformedCode, {
    printWidth: 80,
    singleQuote: true,
    semi: false,
    prettier: true,
  })


  if(!fs.existsSync(outPath)){
    fs.mkdirSync(outPath , {recursive:true})
  }

  fs.writeFileSync(outFile, typescriptCode)
});
