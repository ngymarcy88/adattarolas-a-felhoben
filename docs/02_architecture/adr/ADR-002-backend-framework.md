# ADR-002: NestJS backend

## Status

Accepted

## Date

2026-06-25

## Context

A backendnek authentikaciot, authorizationt, fajlmetaadat-kezelest, presigned URL flow-t, usage accountingot, sharing logikat es egyseges hibakezelest kell tartalmaznia. Ezekhez tiszta modulhatarok, dependency injection es unit tesztelheto service retegek kellenek.

## Decision

A backend Node.js + TypeScript alapon NestJS-sel keszul. A rendszer modulokra bontva epul: `auth`, `users`, `files`, `storage`, `sharing`, `audit`, `health`, `config` es `common`.

## Alternatives considered

- Express: kisebb kezdeti overhead, de kevesebb strukturat es DI tamogatast adna.
- Fastify onalloan: jo teljesitmeny, de a projektben fontosabb a dokumentalhato modulstrukturazas.
- Spring Boot: eros backend framework, de kilogne a valasztott TypeScript full-stack iranybol.

## Consequences

- A NestJS modulrendszere jol illeszkedik az architekturadokumentacioban rogzitetett hatarokhoz.
- A dependency injection megkonnyiti a storage adapter es Prisma service mockolasat unit tesztekben.
- A controllerek vekonyak maradhatnak, az uzleti logika service-ekbe kerul.
- A framework boilerplate nagyobb, mint Expressnel, de a szakdolgozati dokumentalhatosag miatt ez elfogadhato.

## Verification

- A kesobbi backend scaffold modulstrukturaja koveti a dokumentalt modulokat.
- Unit tesztek service szinten ellenorzik az auth, ownership, validation, usage es sharing szabalyokat.
- A kod review kulon figyeli, hogy business logic ne keruljon controllerbe.
