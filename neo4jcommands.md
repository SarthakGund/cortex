# Neo4j Commands (SPIT)

Use these in Neo4j Browser (http://localhost:7474) or any Cypher client.

## Basics

```cypher
// Show a few nodes
MATCH (n) RETURN n LIMIT 25;
```

```cypher
// Show a small subgraph
MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 50;
```

```cypher
// Count total nodes and relationships
MATCH (n) RETURN count(n) AS nodes;
MATCH ()-[r]->() RETURN count(r) AS relationships;
```

```cypher
// List node labels and relationship types
CALL db.labels();
CALL db.relationshipTypes();
```

## Service (repo) scoped queries

SPIT stores repo scope under the `service` property.

```cypher
// Set a parameter for reuse
:param service => "my-repo-key";

// Count nodes for one repo
MATCH (n {service: $service}) RETURN count(n) AS nodes;

// Show a small subgraph for one repo
MATCH (n {service: $service})-[r]->(m {service: $service})
RETURN n, r, m LIMIT 50;
```

## Common graph views

```cypher
// Services
MATCH (s:Service) RETURN s;
```

```cypher
// Files in a repo
MATCH (f:File {service: $service}) RETURN f LIMIT 50;
```

```cypher
// Endpoints in a repo
MATCH (e:Endpoint {service: $service}) RETURN e LIMIT 100;
```

```cypher
// Functions and their call edges
MATCH (f:Function {service: $service})-[r:CALLS]->(g:Function {service: $service})
RETURN f, r, g LIMIT 100;
```

```cypher
// Dependencies between files
MATCH (a:File {service: $service})-[r:IMPORTS]->(b:File {service: $service})
RETURN a, r, b LIMIT 100;
```

## Cleanup / delete data

### Clear one repo graph only

```cypher
:param service => "my-repo-key";

// Delete all nodes for a single repo
MATCH (n {service: $service}) DETACH DELETE n;
```

If you also want to delete event logs for that repo:

```cypher
:param service => "my-repo-key";

MATCH (e:Event {service: $service}) DETACH DELETE e;
```

### Clear everything (all repos)

```cypher
// DANGER: removes all nodes and relationships
MATCH (n) DETACH DELETE n;
```

## Optional: verify cleanup

```cypher
MATCH (n) RETURN count(n) AS nodes;
MATCH ()-[r]->() RETURN count(r) AS relationships;
```
