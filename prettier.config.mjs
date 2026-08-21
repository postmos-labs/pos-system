/** @type {import("prettier").Config} */
export default {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
  tabWidth: 2,
  // git core.autocrlf=true가 체크아웃 시 CRLF로 바꿔놓는데 기본값 "lf"와 충돌해
  // --check가 내용과 무관하게 전 파일에서 실패한다. 파일에 이미 있는 줄바꿈을 그대로 유지.
  endOfLine: "auto",
};
