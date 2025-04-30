import { getCloudflareContext } from "@opennextjs/cloudflare";
import { signAsync, verifyAsync } from "./jwt";
import { JwtPayload } from "jsonwebtoken";

enum TokenType {
  ACCESS = "access",
  REFRESH = "refresh",
}

interface TokenPayload {
  sub: string;
  serviceId: string;
}

export class TokenManager {
  private static readonly secrets: Record<TokenType, string> = {
    [TokenType.ACCESS]: getCloudflareContext().env.ACCESS_TOKEN_SECRET,
    [TokenType.REFRESH]: getCloudflareContext().env.REFRESH_TOKEN_SECRET,
  };

  public static async generateToken(payload: TokenPayload, type: TokenType) {
    const token = await signAsync(payload, this.secrets[type], {
      expiresIn: "1h",
    });

    return token;
  }

  public static async validateToken(token: string, type: TokenType) {
    const decoded = await verifyAsync(token, this.secrets[type]);

    if (!decoded) {
      throw new Error("Invalid token");
    }

    return decoded as JwtPayload & TokenPayload;
  }
}
