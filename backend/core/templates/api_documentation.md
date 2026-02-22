# System Architecture Documentation
Generated on: {{generated_at}}

## Overview
{{system_overview}}

## Services
{{#services}}
### Service: {{name}}
- **Description:** {{description}}
- **Language:** {{language}}

#### Endpoints
| Method | Path | File |
|--------|------|------|
{{#endpoints}}
| {{method}} | {{path}} | {{file_path}} |
{{/endpoints}}

#### Models & Schemas
{{#schemas}}
- **{{name}}** (Type: {{type}}) - Defined in `{{file_path}}`
{{/schemas}}

---
{{/services}}

## Component Relationships
{{relationships}}
