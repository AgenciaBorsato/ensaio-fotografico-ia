"""
Face Scoring Microservice
Compara semelhança facial entre fotos geradas e fotos de referência
usando InsightFace (ArcFace embeddings).
"""

import io
import numpy as np
import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from insightface.app import FaceAnalysis
from PIL import Image

app = FastAPI(title="Face Scoring API")

# Inicializar InsightFace com ArcFace
face_app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
face_app.prepare(ctx_id=0, det_size=(640, 640))


class ScoreRequest(BaseModel):
    generated_url: str
    reference_urls: list[str]


class ScoreResponse(BaseModel):
    score: float  # 0-100
    faces_detected_generated: int
    faces_detected_references: int
    details: dict


async def download_image(url: str) -> np.ndarray:
    """Baixa imagem de uma URL e converte para numpy array (BGR)."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url)
        response.raise_for_status()

    image = Image.open(io.BytesIO(response.content)).convert("RGB")
    # Converter para BGR (formato que InsightFace espera)
    return np.array(image)[:, :, ::-1]


def get_face_embedding(image: np.ndarray) -> np.ndarray | None:
    """Extrai embedding facial da imagem. Retorna None se não encontrar rosto."""
    faces = face_app.get(image)
    if not faces:
        return None
    # Pegar o rosto com maior score de detecção
    best_face = max(faces, key=lambda f: f.det_score)
    return best_face.embedding


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Calcula similaridade de cosseno entre dois vetores."""
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


@app.get("/health")
async def health():
    return {"status": "ok", "model": "buffalo_l (ArcFace)"}


@app.post("/score", response_model=ScoreResponse)
async def score_face(request: ScoreRequest):
    """
    Compara a face na imagem gerada com as faces de referência.
    Retorna um score de 0-100 representando a semelhança.
    """
    try:
        # 1. Baixar e processar imagem gerada
        generated_img = await download_image(request.generated_url)
        generated_embedding = get_face_embedding(generated_img)

        if generated_embedding is None:
            return ScoreResponse(
                score=0,
                faces_detected_generated=0,
                faces_detected_references=0,
                details={"error": "Nenhum rosto detectado na imagem gerada"},
            )

        # 2. Baixar e processar fotos de referência
        reference_embeddings = []
        for url in request.reference_urls:
            try:
                ref_img = await download_image(url)
                ref_embedding = get_face_embedding(ref_img)
                if ref_embedding is not None:
                    reference_embeddings.append(ref_embedding)
            except Exception:
                continue  # Pular referências que falharem

        if not reference_embeddings:
            return ScoreResponse(
                score=0,
                faces_detected_generated=1,
                faces_detected_references=0,
                details={"error": "Nenhum rosto detectado nas referências"},
            )

        # 3. Calcular similaridade média com todas as referências
        similarities = [
            cosine_similarity(generated_embedding, ref)
            for ref in reference_embeddings
        ]

        # Média das top-K similaridades (ignora outliers)
        top_k = min(5, len(similarities))
        sorted_sims = sorted(similarities, reverse=True)[:top_k]
        avg_similarity = sum(sorted_sims) / len(sorted_sims)

        # 4. Converter para score 0-100
        # Cosine similarity para faces normalmente varia de 0.0 a 1.0
        # > 0.5 = mesma pessoa, > 0.3 = parecido
        # Normalizamos para 0-100 onde 0.3 = 0% e 0.7+ = 100%
        score = max(0, min(100, (avg_similarity - 0.2) / 0.5 * 100))

        return ScoreResponse(
            score=round(score, 1),
            faces_detected_generated=1,
            faces_detected_references=len(reference_embeddings),
            details={
                "avg_cosine_similarity": round(avg_similarity, 4),
                "max_cosine_similarity": round(max(similarities), 4),
                "min_cosine_similarity": round(min(similarities), 4),
                "num_references_used": len(reference_embeddings),
                "similarities": [round(s, 4) for s in similarities],
            },
        )

    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=f"Erro ao baixar imagem: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro interno: {str(e)}")
