'use strict';

window.hexTaskBridge = {
  getActiveTask() {
    return typeof window.getActiveTask === 'function' ? window.getActiveTask() : null;
  },
  runTask(taskId) {
    return typeof window.runTask === 'function' ? window.runTask(taskId) : Promise.resolve(null);
  },
  setTaskStatus(taskId, status, dur) {
    return typeof window.setTaskStatus === 'function' ? window.setTaskStatus(taskId, status, dur) : null;
  }
};
