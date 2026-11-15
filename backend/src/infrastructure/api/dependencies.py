from functools import lru_cache
from fastapi import Depends
from ..config import settings
from ..adapters.redis_cache import RedisCache
from ..adapters.irsa_sia_adapter import IRSASIAAdapter
from ..adapters.irsa_ibe_adapter import IRSAIBEAdapter
from ..adapters.numpy_processor import NumpyImageProcessor
from ..adapters.sqlite_candidate_repo import SQLiteCandidateRepository
from ..adapters.irsa_most_adapter import IRSAMostAdapter
from ...application.use_cases.query_sky_region import QuerySkyRegionUC
from ...application.use_cases.compare_observations import CompareObservationsUC
from ...application.use_cases.search_candidates import SearchCandidatesUC
from ...application.use_cases.generate_evidence import GenerateEvidenceUC
from ...domain.services.confidence_scorer import ConfidenceScorer

@lru_cache()
def get_cache() -> RedisCache:
    return RedisCache(settings.redis_url)

@lru_cache()
def get_sia_adapter() -> IRSASIAAdapter:
    return IRSASIAAdapter(
        settings.irsa_sia2_url,
        settings.database_url,
        timeout=settings.irsa_query_timeout_seconds,
    )

@lru_cache()
def get_ibe_adapter() -> IRSAIBEAdapter:
    return IRSAIBEAdapter(
        settings.database_url,
        timeout=settings.irsa_cutout_timeout_seconds,
        cache=get_cache(),
    )

@lru_cache()
def get_processor() -> NumpyImageProcessor:
    return NumpyImageProcessor()

@lru_cache()
def get_candidate_repo() -> SQLiteCandidateRepository:
    return SQLiteCandidateRepository(settings.database_url)

@lru_cache()
def get_most_adapter() -> IRSAMostAdapter:
    return IRSAMostAdapter(settings.irsa_most_url)

def get_query_sky_region_uc(
    repo: IRSASIAAdapter = Depends(get_sia_adapter),
    cache: RedisCache = Depends(get_cache),
) -> QuerySkyRegionUC:
    return QuerySkyRegionUC(obs_repo=repo, cache=cache)

def get_compare_uc(
    image_source: IRSAIBEAdapter = Depends(get_ibe_adapter),
    processor: NumpyImageProcessor = Depends(get_processor),
    cache: RedisCache = Depends(get_cache),
) -> CompareObservationsUC:
    return CompareObservationsUC(image_source=image_source, processor=processor, cache=cache)

def get_search_candidates_uc(
    repo: SQLiteCandidateRepository = Depends(get_candidate_repo),
) -> SearchCandidatesUC:
    return SearchCandidatesUC(candidate_repo=repo)

def get_evidence_uc(
    repo: SQLiteCandidateRepository = Depends(get_candidate_repo),
    most: IRSAMostAdapter = Depends(get_most_adapter),
) -> GenerateEvidenceUC:
    return GenerateEvidenceUC(candidate_repo=repo, solar_system=most, scorer=ConfidenceScorer())
