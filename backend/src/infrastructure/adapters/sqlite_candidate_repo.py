import os
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ...domain.entities.candidate import Candidate
from ..db.models import CandidateModel
from ..db.session import get_session_factory, get_engine, create_tables

class SQLiteCandidateRepository:
    def __init__(self, database_url: str = "sqlite+aiosqlite:///./data/skytrace.db") -> None:
        self._database_url = database_url
        self._memory_candidates: dict[str, Candidate] = {}
        self._memory_by_comp: dict[str, list[str]] = {}

    async def _get_session(self) -> AsyncSession:
        factory = get_session_factory()
        if factory is None:
            await create_tables(self._database_url)
            factory = get_session_factory()
        return factory()

    async def save(self, candidate: Candidate, comparison_id: str) -> None:
        # Save in memory cache
        self._memory_candidates[candidate.id] = candidate
        if comparison_id not in self._memory_by_comp:
            self._memory_by_comp[comparison_id] = []
        if candidate.id not in self._memory_by_comp[comparison_id]:
            self._memory_by_comp[comparison_id].append(candidate.id)

        try:
            async with await self._get_session() as session:
                async with session.begin():
                    model = CandidateModel(
                        id=candidate.id,
                        comparison_id=comparison_id,
                        ra=candidate.ra,
                        dec=candidate.dec,
                        pixel_x=candidate.pixel_x,
                        pixel_y=candidate.pixel_y,
                        snr_change=candidate.snr_change,
                        delta_flux=candidate.delta_flux,
                        delta_flux_sigma=candidate.delta_flux_sigma,
                        motion_arcsec=candidate.motion_arcsec,
                        artifact_probability=candidate.artifact_probability,
                        confidence_score=candidate.confidence_score,
                        most_match=candidate.most_match,
                        most_object_name=candidate.most_object_name,
                        created_at=datetime.utcnow(),
                    )
                    await session.merge(model)
        except Exception:
            pass

    async def get_by_comparison(self, comparison_id: str) -> list[Candidate]:
        try:
            async with await self._get_session() as session:
                stmt = select(CandidateModel).where(CandidateModel.comparison_id == comparison_id)
                res = await session.execute(stmt)
                models = res.scalars().all()
                if models:
                    return [
                        Candidate(
                            id=m.id,
                            ra=m.ra,
                            dec=m.dec,
                            pixel_x=m.pixel_x,
                            pixel_y=m.pixel_y,
                            snr_change=m.snr_change,
                            delta_flux=m.delta_flux,
                            delta_flux_sigma=m.delta_flux_sigma,
                            motion_arcsec=m.motion_arcsec,
                            artifact_probability=m.artifact_probability,
                            confidence_score=m.confidence_score,
                            most_match=m.most_match,
                            most_object_name=m.most_object_name,
                        )
                        for m in models
                    ]
        except Exception:
            pass

        # Fallback to in-memory store
        cand_ids = self._memory_by_comp.get(comparison_id, [])
        return [self._memory_candidates[cid] for cid in cand_ids if cid in self._memory_candidates]

    async def get_by_id(self, candidate_id: str) -> Candidate | None:
        if candidate_id in self._memory_candidates:
            return self._memory_candidates[candidate_id]

        try:
            async with await self._get_session() as session:
                stmt = select(CandidateModel).where(CandidateModel.id == candidate_id)
                res = await session.execute(stmt)
                m = res.scalar_one_or_none()
                if m:
                    cand = Candidate(
                        id=m.id,
                        ra=m.ra,
                        dec=m.dec,
                        pixel_x=m.pixel_x,
                        pixel_y=m.pixel_y,
                        snr_change=m.snr_change,
                        delta_flux=m.delta_flux,
                        delta_flux_sigma=m.delta_flux_sigma,
                        motion_arcsec=m.motion_arcsec,
                        artifact_probability=m.artifact_probability,
                        confidence_score=m.confidence_score,
                        most_match=m.most_match,
                        most_object_name=m.most_object_name,
                    )
                    self._memory_candidates[m.id] = cand
                    return cand
        except Exception:
            pass

        return None
