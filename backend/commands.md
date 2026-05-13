# Neo4j Commands

## View All Services

```cypher
MATCH (s:Service)
RETURN s.name, s.description, s.language, s.service, s.last_updated
ORDER BY s.name
```

Or view as a table with all properties:

```cypher
MATCH (s:Service)
RETURN properties(s) AS service_details
ORDER BY s.name
```

To see services with their relationships (endpoints, databases, modules):

```cypher
MATCH (s:Service)-[r]-(related)
RETURN s.name AS service,
       type(r) AS relationship,
       labels(related)[0] AS related_type,
       coalesce(related.name, related.path, related.title, 'N/A') AS related_name
ORDER BY s.name, relationship
```

---

## Other Useful Queries

### Count all nodes by type

```cypher
MATCH (n)
WITH labels(n)[0] AS label, count(n) AS cnt
RETURN label, cnt
ORDER BY cnt DESC
```

### View all relationships in the graph

```cypher
MATCH (a)-[r]->(b)
RETURN labels(a)[0] AS source_type, type(r) AS relationship, labels(b)[0] AS target_type
ORDER BY source_type, relationship, target_type
```