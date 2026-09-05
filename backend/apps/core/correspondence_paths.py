def correspondence_path(item):
    registry = {"external": "externes", "internal": "internes"}[item.registry]
    return f"/courriers/{registry}/{item.id}"
