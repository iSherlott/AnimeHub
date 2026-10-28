-- Sistema fechado (28/10): o admin cria as contas com senha provisória, que a pessoa troca no primeiro login.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
