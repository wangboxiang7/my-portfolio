// Particle animation inspired by minimal hero effects
const canvas = document.getElementById('particles');
const ctx = canvas.getContext('2d');

const particleConfig = {
  count: 80,
  speed: 0.3,
  maxRadius: 2.2,
  lineDistance: 140
};

let particles = [];
let width = 0;
let height = 0;

function resizeCanvas() {
  width = canvas.width = window.innerWidth;
  height = canvas.height = document.getElementById('home').offsetHeight;
}

function createParticles() {
  particles = Array.from({ length: particleConfig.count }).map(() => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * particleConfig.speed,
    vy: (Math.random() - 0.5) * particleConfig.speed,
    r: Math.random() * particleConfig.maxRadius + 0.4
  }));
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';

  particles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;

    if (p.x < 0 || p.x > width) p.vx *= -1;
    if (p.y < 0 || p.y > height) p.vy *= -1;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  });

  // draw connecting lines
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.12)';
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const dist = Math.hypot(dx, dy);
      if (dist < particleConfig.lineDistance) {
        const alpha = 1 - dist / particleConfig.lineDistance;
        ctx.strokeStyle = `rgba(34, 211, 238, ${alpha * 0.2})`;
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.stroke();
      }
    }
  }

  requestAnimationFrame(draw);
}

function init() {
  resizeCanvas();
  createParticles();
  requestAnimationFrame(draw);
}

window.addEventListener('resize', () => {
  resizeCanvas();
  createParticles();
});

// Smooth scroll for nav links
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const targetId = link.getAttribute('href');
    const target = document.querySelector(targetId);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

init();

// AI Workflow front-end handler (talks to serverless API)
const form = document.getElementById('workflow-form');
const runBtn = document.getElementById('run-btn');
const loading = document.getElementById('loading');
const result = document.getElementById('result');

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

if (form && runBtn && loading && result) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const resumeFile = document.getElementById('resume')?.files?.[0];
    const jdFile = document.getElementById('jd')?.files?.[0];
    if (!resumeFile || !jdFile) {
      result.textContent = '请上传简历 PDF 与 JD 截图。';
      return;
    }

    const [resumeBase64, jdBase64] = await Promise.all([
      fileToBase64(resumeFile),
      fileToBase64(jdFile)
    ]);

    runBtn.disabled = true;
    loading.classList.remove('hidden');
    result.textContent = '运行中，请稍候...';

    try {
      const resp = await fetch('/api/run-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeBase64,
          resumeName: resumeFile.name,
          jdBase64,
          jdName: jdFile.name,
          content: '请生成简历与 JD 的匹配度分析报告'
        })
      });
      
      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({ error: `HTTP ${resp.status}: ${resp.statusText}` }));
        result.textContent = `错误: ${errorData.error || errorData.msg || '请求失败'}`;
        if (errorData.debug_url) {
          result.textContent += `\n调试链接: ${errorData.debug_url}`;
        }
        return;
      }
      
      const data = await resp.json();
      
      // 处理两种情况：1) 立即完成（有 output），2) 需要轮询（有 execute_id）
      if (data.status === 'Success' && data.output) {
        // Workflow 立即完成，直接显示结果
        result.textContent = data.output;
        if (data.debug_url) {
          result.innerHTML += `<br><a href="${data.debug_url}" target="_blank" class="text-emerald-400 underline">查看调试链接</a>`;
        }
      } else if (data.execute_id) {
        // 需要轮询
        result.textContent = `任务已启动，执行ID: ${data.execute_id}\n${data.message || ''}`;
        if (data.debug_url) {
          result.innerHTML += `<br><a href="${data.debug_url}" target="_blank" class="text-emerald-400 underline">查看调试链接</a>`;
        }

        const poll = async () => {
          try {
            const statusResp = await fetch(`/api/check-status?id=${encodeURIComponent(data.execute_id)}`);
            const statusData = await statusResp.json();
            if (statusData.status === 'Running') {
              result.textContent = `任务执行中... (ID: ${data.execute_id})`;
              setTimeout(poll, 3000);
            } else if (statusData.status === 'Success') {
              result.textContent = statusData.output || 'No output.';
              if (statusData.debug_url) {
                result.innerHTML += `<br><a href="${statusData.debug_url}" target="_blank" class="text-emerald-400 underline">查看调试链接</a>`;
              }
            } else {
              result.textContent = statusData.error || 'Workflow 执行失败';
              if (statusData.debug_url) {
                result.innerHTML += `<br><a href="${statusData.debug_url}" target="_blank" class="text-emerald-400 underline">查看调试链接</a>`;
              }
            }
          } catch (e) {
            console.error(e);
            result.textContent = '状态查询失败，请稍后重试。';
          }
        };

        setTimeout(poll, 3000);
      } else {
        // 兼容旧同步模式或其他格式
        result.textContent = data.output || data.error || 'No output.';
      }
    } catch (err) {
      console.error(err);
      result.textContent = '请求失败，请稍后重试。';
    } finally {
      runBtn.disabled = false;
      loading.classList.add('hidden');
      result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}
