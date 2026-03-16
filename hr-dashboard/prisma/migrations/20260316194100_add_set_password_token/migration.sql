CREATE TABLE "SetPasswordToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SetPasswordToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SetPasswordToken_tokenHash_key" ON "SetPasswordToken"("tokenHash");
CREATE INDEX "SetPasswordToken_userId_idx" ON "SetPasswordToken"("userId");
CREATE INDEX "SetPasswordToken_expiresAt_idx" ON "SetPasswordToken"("expiresAt");

ALTER TABLE "SetPasswordToken"
  ADD CONSTRAINT "SetPasswordToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
