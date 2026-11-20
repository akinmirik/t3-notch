"""Pulse Pocket render hooks. Install in Blender's user scripts/startup directory.

For scripted model exports:
    import pulse_notify
    with pulse_notify.export_job('Product GLB'):
        bpy.ops.export_scene.gltf(filepath=output)
This does not change scenes, render settings, or automatic script execution policy.
"""
import contextlib
import datetime
import json
import os
import pathlib
import uuid
import bpy
from bpy.app.handlers import persistent

_render_id = None

def _emit(kind, title, job_id=None):
    try:
        base = os.environ.get('PULSE_JOB_DIR')
        folder = pathlib.Path(base) if base else pathlib.Path(os.environ['LOCALAPPDATA']) / 'akin-host/pulse-pocket/jobs'
        folder.mkdir(parents=True, exist_ok=True)
        job_id = job_id or str(uuid.uuid4())
        event = dict(id=job_id,kind=kind,title=title[:120],time=datetime.datetime.now(datetime.timezone.utc).isoformat())
        temporary = folder / (job_id+'.tmp')
        temporary.write_text(json.dumps(event,ensure_ascii=False),encoding='utf-8')
        temporary.replace(folder / (job_id+'.json'))
    except Exception as error:
        print('Pulse: notification could not be queued ('+type(error).__name__+')')

def _title(scene):
    return pathlib.Path(bpy.data.filepath).stem if bpy.data.filepath else scene.name or 'Blender render'

@persistent
def pulse_render_init(scene):
    global _render_id
    _render_id = str(uuid.uuid4())

@persistent
def pulse_render_complete(scene):
    global _render_id
    if _render_id:
        _emit('render_complete',_title(scene),_render_id)
        _render_id = None

@persistent
def pulse_render_cancel(scene):
    global _render_id
    if _render_id:
        _emit('render_cancel',_title(scene),_render_id)
        _render_id = None

@contextlib.contextmanager
def export_job(title):
    """Wrap a synchronous export; exceptions remain visible to the caller."""
    try:
        yield
    except BaseException:
        _emit('export_failed',title)
        raise
    else:
        _emit('export_complete',title)

def unregister():
    for handlers in (bpy.app.handlers.render_init,bpy.app.handlers.render_complete,bpy.app.handlers.render_cancel):
        for handler in list(handlers):
            if getattr(handler,'__module__',None)==__name__:
                handlers.remove(handler)

def register():
    unregister()
    bpy.app.handlers.render_init.append(pulse_render_init)
    bpy.app.handlers.render_complete.append(pulse_render_complete)
    bpy.app.handlers.render_cancel.append(pulse_render_cancel)

if __name__ == '__main__':
    register()
