import type { ReadStream, WriteStream } from "node:tty";

export type PasswordReader = (prompt: string) => Promise<string>;

export async function readConfirmedPassword(
  readPassword: PasswordReader = promptHiddenPassword,
): Promise<string> {
  const password = await readPassword("Password: ");
  const confirmation = await readPassword("Confirm password: ");

  if (password !== confirmation) {
    throw new Error("Passwords do not match");
  }
  if (password.length < 12) {
    throw new Error("Password must contain at least 12 characters");
  }
  if (password.length > 128) {
    throw new Error("Password must contain at most 128 characters");
  }

  return password;
}

export function promptHiddenPassword(
  prompt: string,
  input: ReadStream = process.stdin,
  output: WriteStream = process.stderr,
): Promise<string> {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function") {
    return Promise.reject(new Error("Password input requires an interactive terminal"));
  }

  output.write(prompt);
  input.setEncoding("utf8");
  input.setRawMode(true);
  input.resume();

  return new Promise<string>((resolve, reject) => {
    let password = "";

    const finish = (error?: Error) => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");

      if (error) {
        reject(error);
      } else {
        resolve(password);
      }
    };

    const onData = (chunk: string | Buffer) => {
      for (const character of String(chunk)) {
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u0003") {
          finish(new Error("Password input cancelled"));
          return;
        }
        if (character === "\u007f" || character === "\b") {
          password = password.slice(0, -1);
          continue;
        }

        password += character;
      }
    };

    input.on("data", onData);
  });
}
