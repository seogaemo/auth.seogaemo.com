-- 허용된 이메일, 도메인만 로그인하기.
-- prisma diff는 Service 테이블을 새로 만들어 옮기는 SQL을 내지만, D1은 PRAGMA foreign_keys=OFF를 무시해서
-- DROP TABLE이 User, Identity 등을 cascade로 지울 수 있다. 그래서 열만 더한다.
-- AlterTable
ALTER TABLE "Service" ADD COLUMN "restrictLogin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Service" ADD COLUMN "allowedEmails" JSONB NOT NULL DEFAULT '[]';
