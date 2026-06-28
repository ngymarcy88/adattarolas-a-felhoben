# Architektúra dokumentumok

Ez a mappa a rendszer architektúráját és fő technikai döntéseit dokumentálja. A 3. mérföldkő dokumentumai tervezett architektúrát írnak le; futtatható frontend/backend alkalmazás még nem készült.

## Dokumentumok

- [C4 Context](c4_context.md): külső szereplők és infrastruktúra-elemek.
- [C4 Container](c4_container.md): SPA, backend API, Prisma, PostgreSQL és object storage konténerek.
- [C4 Component](c4_component.md): tervezett NestJS modulhatárok.
- [Quality Attributes](quality_attributes.md): security, privacy, modifiability, testability, reliability, observability és local reproducibility.
- [ADR-ek](adr/README.md): elfogadott architekturális döntések.

## Fontos szerződések

- A frontend nem tárol S3/MinIO credentialt.
- A backend kontrollálja a presigned upload, preview, download és share-link hozzáférést.
- A bináris fájltartalom object storage-ban, az alkalmazási metadata PostgreSQL-ben él.
- A storage elérés adapteren keresztül történik.
- A soft delete alatt álló fájl továbbra is beleszámít a kvótába.
- Multipart upload nem MVP-rész, hanem későbbi bővítés.
