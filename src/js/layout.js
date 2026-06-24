'use strict';
// == layout.js == UI Panel Resizing Logic ====================================

window.addEventListener('DOMContentLoaded', () => {
    const app = document.getElementById('app');
    let activeResizer = null;

    const resizerLeft = document.getElementById('resz-left');
    const resizerRight = document.getElementById('resz-right');
    const resizerBot = document.getElementById('resz-bot');
    const resizerTop = document.getElementById('resz-top');

    if (resizerLeft) {
        resizerLeft.addEventListener('mousedown', (e) => {
            activeResizer = 'left';
            resizerLeft.classList.add('active');
            document.body.style.cursor = 'col-resize';
            e.preventDefault();
        });
    }

    if (resizerRight) {
        resizerRight.addEventListener('mousedown', (e) => {
            activeResizer = 'right';
            resizerRight.classList.add('active');
            document.body.style.cursor = 'col-resize';
            e.preventDefault();
        });
    }

    if (resizerBot) {
        resizerBot.addEventListener('mousedown', (e) => {
            activeResizer = 'bottom';
            resizerBot.classList.add('active');
            document.body.style.cursor = 'row-resize';
            e.preventDefault();
        });
    }

    window.addEventListener('mousemove', (e) => {
        if (!activeResizer) return;
        if (window.isVoiceAgiActive?.()) return;

        if (activeResizer === 'left') {
            // e.clientX is roughly the width of the left panel
            const newWidth = Math.max(200, Math.min(e.clientX, window.innerWidth - 400));
            app.style.setProperty('--sz-left', newWidth + 'px');
        }
        else if (activeResizer === 'right') {
            // right panel width is total width - clientX
            const curRightW = window.innerWidth - e.clientX;
            const newWidth = Math.max(200, Math.min(curRightW, window.innerWidth - 400));
            app.style.setProperty('--sz-right', newWidth + 'px');
        }
        else if (activeResizer === 'bottom') {
            const bottomBottom = app.getBoundingClientRect().bottom; // usually window.innerHeight
            const bottomH = window.innerHeight - e.clientY;
            const newHeight = Math.max(100, Math.min(bottomH, window.innerHeight - 200));
            app.style.setProperty('--sz-bottom', newHeight + 'px');
        }
        else if (activeResizer === 'top') {
            const topH = e.clientY - 62;
            const newHeight = Math.max(80, Math.min(topH, window.innerHeight - 250));
            app.style.setProperty('--sz-top', newHeight + 'px');
        }
    });

    window.addEventListener('mouseup', () => {
        if (activeResizer) {
            if (resizerLeft) resizerLeft.classList.remove('active');
            if (resizerRight) resizerRight.classList.remove('active');
            if (resizerBot) resizerBot.classList.remove('active');
            if (resizerTop) resizerTop.classList.remove('active');
            document.body.style.cursor = '';
            activeResizer = null;
        }
    });
});

