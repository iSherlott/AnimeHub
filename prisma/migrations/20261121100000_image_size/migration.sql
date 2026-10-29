-- Tamanho real das imagens de banner (só adiciona): o banner e o plano de fundo do perfil oferecem só imagens em Full HD.
CREATE TABLE "ImageSize" (
    "url" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageSize_pkey" PRIMARY KEY ("url")
);
