# System Architecture Documentation
Generated on: 2026-02-21 19:48:38

## Overview
This architectural overview outlines a multi-service ecosystem composed of two primary systems: **NyayaSetu**, a comprehensive legal intelligence platform, and **MegaHack**, a fintech-oriented utility service.

### 1. System Overview
The project follows a distributed service-oriented architecture using a polyglot stack (Python and JavaScript/TypeScript). While no direct inter-service communication is currently defined, the architecture is partitioned into a high-scale legal research engine and a specialized financial integration layer.

---

### 2. Component Analysis

#### A. NyayaSetu (Legal Intelligence & RAG Engine)
NyayaSetu is the core functional block, designed for document processing, legal research, and automated agentic workflows.
*   **Presentation Layer:** Developed in TypeScript/React (Next.js), utilizing a modular UI component library. It manages complex state for document comparisons (`ComparisonData`), legal citations (`CitationBadgeProps`), and interactive research sessions.
*   **Service Layer (Python/FastAPI or Flask):**
    *   **Document Intelligence:** Handles ingestion (`/docingest`) and RAG-based querying (`/docquery`).
    *   **Legal Research:** Provides specialized endpoints for case-law searching and document retrieval.
    *   **Agentic Orchestration:** Features an `/agent` endpoint, suggesting an LLM-powered reasoning engine to handle complex legal requests.
    *   **External Integration:** Includes a dedicated WhatsApp gateway (`/whatsapp`) for mobile accessibility.
*   **Data Modeling:** Strict contract enforcement using **Pydantic** on the backend and **TypeScript interfaces** on the frontend, ensuring type safety across the legal data pipeline.

#### B. MegaHack (Financial & Utility Layer)
MegaHack acts as a specialized integration service, primarily interfacing with financial markets and system monitoring.
*   **Brokerage Integration:** Features a dedicated Zerodha API route, likely for executing trades or retrieving market data.
*   **Command & Control:** A Python-based server provides a `/command` interface for remote execution and a `/metrics` endpoint for system observability.
*   **Hybrid Routing:** Utilizes both Node.js (via `route.js`) and Python (via `server.py`), indicating a micro-proxy or sidecar-style deployment.

---

### 3. Technical Patterns & Communication
*   **API Design:** Both services exclusively utilize **RESTful APIs** with a heavy reliance on `POST` methods for complex data submittal (ingestion, searching, and agentic queries).
*   **Data Consistency:** The architecture employs a dual-schema strategy:
    *   **Pydantic Models** (e.g., `CaseLawSearchRequest`, `LegalRequest`) manage backend validation and business logic.
    *   **TS Interfaces** (e.g., `ConversationEntry`, `Analysis`) handle frontend state and UI rendering.
*   **Asynchronous Processing:** The presence of document ingestion and "Agent" endpoints implies an underlying asynchronous task queue (likely Celery or similar) to handle long-running LLM or indexing operations.

### 4. High-Level Data Flow
1.  **Ingestion:** Users upload legal documents via the frontend, which are processed through the `backend_doc` server for indexing.
2.  **Intelligence Retrieval:** Users query the system; the `/agent` or `/docquery` endpoints coordinate with a vector store or LLM to return synthesized legal insights.
3.  **Cross-Platform Access:** Legal queries can be triggered via the web UI or the WhatsApp integration.
4.  **Financial Execution:** Independent financial commands are routed through the MegaHack service to external brokerage APIs (Zerodha).

## Services
### Service: MegaHack
- **Description:** Ingested from https://github.com/Prasham-Karkera/MegaHack
- **Language:** Mixed

#### Endpoints
| Method | Path | File |
|--------|------|------|
| GET | / | C:\Users\steve\AppData\Local\Temp\tmpmmzihews\app\api\zerodha\route.js |
| POST | /command | C:\Users\steve\AppData\Local\Temp\tmp3fj9l757\server.py |
| GET | /metrics | C:\Users\steve\AppData\Local\Temp\tmp3fj9l757\server.py |

#### Models & Schemas

---
### Service: NyayaSetu
- **Description:** Ingested from https://github.com/Sachin1785/NyayaSetu.git
- **Language:** Mixed

#### Endpoints
| Method | Path | File |
|--------|------|------|
| POST | /docingest | C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\backend_doc\server.py |
| POST | /docquery | C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\backend_doc\server.py |
| POST | /whatsapp | C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\backend\whatsapp_bot.py |
| POST | /case-law/document/{doc_id} | C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\backend\server.py |
| POST | /case-law/search | C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\backend\server.py |
| POST | /agent | C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\backend\server.py |
| POST | /compare | C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\frontend\src\components\comparator\ComparatorView.tsx |

#### Models & Schemas
- **ButtonProps** (Type: typescript_interface) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\frontend\src\components\ui\button.tsx`
- **BadgeProps** (Type: typescript_interface) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\frontend\src\components\ui\badge.tsx`
- **CitationBadgeProps** (Type: typescript_interface) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\frontend\src\components\research\CitationBadge.tsx`
- **CaseLawCardProps** (Type: typescript_interface) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\frontend\src\components\research\CaseLawCard.tsx`
- **SidebarProps** (Type: typescript_interface) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\frontend\src\components\layout\Sidebar.tsx`
- **HeaderProps** (Type: typescript_interface) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\frontend\src\components\layout\Header.tsx`
- **BreadcrumbItem** (Type: typescript_interface) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\frontend\src\components\layout\Header.tsx`
- **ComparisonData** (Type: typescript_interface) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\frontend\src\components\comparator\ComparatorView.tsx`
- **Analysis** (Type: typescript_interface) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\frontend\src\components\comparator\ComparatorView.tsx`
- **RelatedNode** (Type: typescript_interface) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\frontend\src\components\comparator\ComparatorView.tsx`
- **PrimaryNode** (Type: typescript_interface) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\frontend\src\components\comparator\ComparatorView.tsx`
- **ConversationEntry** (Type: typescript_interface) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\frontend\src\app\research\page.tsx`
- **ParsedResponse** (Type: typescript_interface) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\frontend\src\app\research\page.tsx`
- **UploadedDocument** (Type: typescript_interface) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\frontend\src\app\documents\page.tsx`
- **Message** (Type: typescript_interface) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\frontend\src\app\documents\page.tsx`
- **CaseLaw** (Type: typescript_interface) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\frontend\src\app\case-law\page.tsx`
- **QueryRequest** (Type: pydantic) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\backend_doc\server.py`
- **IngestRequest** (Type: pydantic) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\backend_doc\server.py`
- **CaseLawResponse** (Type: pydantic) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\backend\server.py`
- **CaseLawSearchRequest** (Type: pydantic) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\backend\server.py`
- **AgentResponse** (Type: pydantic) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\backend\server.py`
- **AgentRequest** (Type: pydantic) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\backend\server.py`
- **ComparisonResponse** (Type: pydantic) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\backend\server.py`
- **LegalRequest** (Type: pydantic) - Defined in `C:\Users\steve\AppData\Local\Temp\tmpyn0tlv09\backend\server.py`

---


## Component Relationships
No inter-service relationships detected.
