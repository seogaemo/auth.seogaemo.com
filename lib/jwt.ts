import { sign, SignOptions, verify } from "jsonwebtoken";

export async function signAsync(
  payload: any,
  secret: string,
  options: SignOptions
) {
  return new Promise((resolve, reject) => {
    sign(payload, secret, options, (err, token) => {
      if (err) reject(err);
      resolve(token);
    });
  });
}

export async function verifyAsync(token: string, secret: string) {
  return new Promise((resolve, reject) => {
    verify(token, secret, (err, decoded) => {
      if (err) reject(err);
      resolve(decoded);
    });
  });
}
