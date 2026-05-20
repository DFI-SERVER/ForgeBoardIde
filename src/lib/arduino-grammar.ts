/** Arduino-specific globals and functions layered onto C++ */
export const ARDUINO_KEYWORDS = [
  // Core structure
  "setup", "loop",
  // Digital I/O
  "pinMode", "digitalWrite", "digitalRead",
  // Analog
  "analogRead", "analogWrite", "analogReference",
  // Time
  "delay", "delayMicroseconds", "millis", "micros",
  // Math
  "min", "max", "abs", "constrain", "map", "pow", "sqrt",
  // Serial
  "Serial",
  // Constants
  "HIGH", "LOW", "INPUT", "OUTPUT", "INPUT_PULLUP",
  "LED_BUILTIN", "true", "false",
];

export const CPP_KEYWORDS = [
  "auto", "bool", "break", "case", "catch", "char", "class", "const",
  "constexpr", "continue", "default", "delete", "do", "double", "else",
  "enum", "explicit", "extern", "false", "float", "for", "friend", "goto",
  "if", "inline", "int", "long", "mutable", "namespace", "new", "noexcept",
  "nullptr", "operator", "private", "protected", "public", "register",
  "return", "short", "signed", "sizeof", "static", "static_assert", "struct",
  "switch", "template", "this", "throw", "true", "try", "typedef", "typeid",
  "typename", "union", "unsigned", "using", "virtual", "void", "volatile",
  "while",
];

export const ARDUINO_MONACO_LANGUAGE = {
  tokenizer: {
    root: [
      // Comments
      [/\/\/.*$/, "comment"],
      [/\/\*/, "comment", "@comment"],
      // Preprocessor
      [/^\s*#\s*\w+/, "keyword.directive"],
      // Strings
      [/"([^"\\]|\\.)*$/, "string.invalid"],
      [/"/, "string", "@string"],
      [/'[^\\']'/, "string"],
      [/'(\\.)'/, "string.escape"],
      // Numbers
      [/0[xX][0-9a-fA-F]+/, "number.hex"],
      [/0[bB][01]+/, "number.binary"],
      [/\d*\.\d+([eE][\-+]?\d+)?[fF]?/, "number.float"],
      [/\d+[uUlL]*/, "number"],
      // Arduino-specific
      [/\b(setup|loop)\b/, "keyword.arduino"],
      [/\b(HIGH|LOW|INPUT|OUTPUT|INPUT_PULLUP|LED_BUILTIN)\b/, "constant.arduino"],
      [/\b(pinMode|digitalWrite|digitalRead|analogRead|analogWrite|delay|delayMicroseconds|millis|micros|map|constrain)\b/, "support.function.arduino"],
      [/\b(Serial|Wire|SPI)\b/, "support.class.arduino"],
      // C++ keywords
      [new RegExp(`\\b(${CPP_KEYWORDS.join("|")})\\b`), "keyword"],
      // Types
      [/\b(uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t|size_t|byte|word|boolean|String)\b/, "type"],
      // Identifiers
      [/[a-zA-Z_]\w*/, "identifier"],
      // Operators
      [/[{}()\[\]]/, "@brackets"],
      [/[<>=!+\-*/%&|^~?:]/, "operator"],
    ],
    comment: [
      [/[^/*]+/, "comment"],
      [/\*\//, "comment", "@pop"],
      [/[/*]/, "comment"],
    ],
    string: [
      [/[^\\"]+/, "string"],
      [/\\./, "string.escape"],
      [/"/, "string", "@pop"],
    ],
  },
};
