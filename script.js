document.addEventListener('DOMContentLoaded', () => {
    // Reveal Animations on Scroll
    const reveals = document.querySelectorAll('.reveal');
    
    const revealOnScroll = () => {
        const windowHeight = window.innerHeight;
        const elementVisible = 100;
        
        reveals.forEach(reveal => {
            const elementTop = reveal.getBoundingClientRect().top;
            if (elementTop < windowHeight - elementVisible) {
                reveal.classList.add('active');
            }
        });
    };
    
    window.addEventListener('scroll', revealOnScroll);
    revealOnScroll(); // Trigger on load

    // Navbar Background on Scroll
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                window.scrollTo({
                    top: target.offsetTop - 70, // Adjust for navbar height
                    behavior: 'smooth'
                });
            }
        });
    });

    // Slight parallax on hero image
    const heroBg = document.querySelector('.hero-bg img');
    window.addEventListener('scroll', () => {
        const scrolled = window.scrollY;
        if (scrolled < window.innerHeight) {
            heroBg.style.transform = `translateY(${scrolled * 0.3}px) scale(1.05)`;
        }
    });

    // Language Switcher Logic
    const langBtns = document.querySelectorAll('.lang-switcher button');
    langBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state of buttons
            document.querySelector('.lang-switcher button.active').classList.remove('active');
            btn.classList.add('active');

            // Determine language tag from btn id
            const newLang = btn.id.split('-')[1]; // returns 'en' or 'es'
            
            // Set document lang attribute for SEO
            document.documentElement.lang = newLang;

            // Swap all texts
            document.querySelectorAll('[data-en][data-es]').forEach(el => {
                // If it is innerHTML to support <br> tags in headings
                if(el.dataset[newLang].includes('<br>')) {
                    el.innerHTML = el.dataset[newLang];
                } else {
                    el.textContent = el.dataset[newLang];
                }
            });
            
            // Re-bind navbar interactions if needed, though they remain structurally intact
        });
    });

    // Testimonial Carousel Logic
    const track = document.querySelector('.carousel-track');
    if (track) {
        const slides = Array.from(track.children);
        const nextButton = document.querySelector('.next-btn');
        const prevButton = document.querySelector('.prev-btn');
        const dotsNav = document.querySelector('.carousel-nav');
        const dots = Array.from(dotsNav.children);
        let currentIndex = 0;

        const moveToSlide = (index) => {
            if(index < 0 || index >= slides.length) return;
            track.style.transform = `translateX(-${index * 100}%)`;
            
            // Update dots
            dots.forEach(dot => dot.classList.remove('current-indicator'));
            if(dots[index]) dots[index].classList.add('current-indicator');
            
            currentIndex = index;
        };

        nextButton.addEventListener('click', () => {
            let nextIndex = currentIndex + 1;
            if(nextIndex >= slides.length) nextIndex = 0; // loop back
            moveToSlide(nextIndex);
        });

        prevButton.addEventListener('click', () => {
            let prevIndex = currentIndex - 1;
            if(prevIndex < 0) prevIndex = slides.length - 1; // loop forward
            moveToSlide(prevIndex);
        });

        dotsNav.addEventListener('click', e => {
            const targetDot = e.target.closest('button');
            if(!targetDot) return;
            const targetIndex = dots.findIndex(dot => dot === targetDot);
            moveToSlide(targetIndex);
        });
        
        // Handle window resize 
        window.addEventListener('resize', () => {
            moveToSlide(currentIndex);
        });
    }

    // FAQ Accordion Logic
    const faqQuestions = document.querySelectorAll('.faq-question');
    
    faqQuestions.forEach(question => {
        question.addEventListener('click', () => {
            const currentItem = question.parentElement;
            const currentAnswer = currentItem.querySelector('.faq-answer');
            
            // Close all other open FAQs
            document.querySelectorAll('.faq-item.active').forEach(item => {
                if (item !== currentItem) {
                    item.classList.remove('active');
                    item.querySelector('.faq-answer').style.maxHeight = null;
                }
            });
            
            // Toggle current FAQ
            currentItem.classList.toggle('active');
            
            if (currentItem.classList.contains('active')) {
                currentAnswer.style.maxHeight = currentAnswer.scrollHeight + "px";
            } else {
                currentAnswer.style.maxHeight = null;
            }
        });
    });

    // Pricing Modal Logic
    const pricingBtns = document.querySelectorAll('.pricing-btn');
    const modal = document.getElementById('pricing-modal');
    const modalCloseBtn = document.querySelector('.modal-close');
    const modalOverlay = document.querySelector('.modal-overlay');
    const optionCards = document.querySelectorAll('.modal-option-card');
    const backBtns = document.querySelectorAll('.back-btn');
    
    // Open modal
    pricingBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            // Reset modal to view selection
            document.querySelectorAll('.modal-view').forEach(v => v.classList.remove('active-view'));
            document.getElementById('modal-view-selection').classList.add('active-view');
            modal.classList.add('active');
            document.body.style.overflow = 'hidden'; // Prevent background scrolling
        });
    });

    const closeModal = () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    };

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
    if (modalOverlay) modalOverlay.addEventListener('click', closeModal);

    // Navigate between views
    optionCards.forEach(card => {
        card.addEventListener('click', () => {
            const targetId = card.getAttribute('data-target');
            document.querySelectorAll('.modal-view').forEach(v => v.classList.remove('active-view'));
            document.getElementById(targetId).classList.add('active-view');
        });
    });

    backBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            document.querySelectorAll('.modal-view').forEach(v => v.classList.remove('active-view'));
            document.getElementById(targetId).classList.add('active-view');
        });
    });

    // Form Submissions Simulated
    const bookingForm = document.getElementById('booking-form');
    const projectForm = document.getElementById('project-form');
    const successView = document.getElementById('modal-view-success');
    
    const showSuccess = (type) => {
        document.querySelectorAll('.modal-view').forEach(v => v.classList.remove('active-view'));
        successView.classList.add('active-view');
        
        document.getElementById('success-message-booking').style.display = 'none';
        document.getElementById('success-message-project').style.display = 'none';
        
        if (type === 'booking') {
            document.getElementById('success-message-booking').style.display = 'block';
        } else {
            document.getElementById('success-message-project').style.display = 'block';
        }
        
        // Auto close modal after 4 seconds
        setTimeout(() => {
            closeModal();
            if (bookingForm) bookingForm.reset();
            if (projectForm) projectForm.reset();
        }, 4000);
    };

    if (bookingForm) {
        bookingForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = bookingForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Enviando...';
            submitBtn.disabled = true;
            
            const data = {
                name: document.getElementById('book-name').value,
                email: document.getElementById('book-email').value,
                date: document.getElementById('book-date').value,
                time: document.getElementById('book-time').value
            };

            try {
                console.log('Attempting to fetch from:', '/api/clients');
                console.log('Payload (Booking):', data);
                
                const response = await fetch('/api/clients', {
                    method: 'POST',
                    mode: 'cors',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data)
                });

                if (response.ok) {
                    showSuccess('booking');
                } else {
                    const errorText = await response.text();
                    console.error('Server error response:', errorText);
                    alert('Error del servidor: ' + errorText);
                }
            } catch (err) {
                console.error('FETCH ERROR:', err);
                alert('ERROR DE CONEXIÓN: ' + err.message);
            } finally {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    if (projectForm) {
        projectForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = projectForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Enviando...';
            submitBtn.disabled = true;
            
            // Construct data
            const data = {
                name: document.getElementById('proj-name').value,
                email: document.getElementById('proj-email').value,
                phone: document.getElementById('proj-phone').value,
                propertyAddress: document.getElementById('proj-address').value,
                projectTitle: document.getElementById('proj-type').value,
                projectType: document.getElementById('proj-type').value,
                desiredDate: document.getElementById('proj-date').value
            };

            try {
                console.log('Attempting to fetch from:', '/api/clients');
                console.log('Payload:', data);
                
                const response = await fetch('/api/clients', {
                    method: 'POST',
                    mode: 'cors', // Explicitly set CORS mode
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data)
                });

                console.log('Response status:', response.status);

                if (response.ok) {
                    const result = await response.json();
                    console.log('Project registered successfully:', result);
                    showSuccess('project');
                } else {
                    const errorText = await response.text();
                    console.error('Server error response:', errorText);
                    alert('Error del servidor: ' + errorText);
                }
            } catch (err) {
                console.error('FETCH ERROR:', err);
                alert('ERROR DE CONEXIÓN: ' + err.message + '\n\nSi estás usando Chrome, el protocolo file:// puede bloquear esta conexión.');
            } finally {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        });
    }
    // --- Improved Scroll-Driven Showcase Logic ---
    const showcaseItems = document.querySelectorAll('.showcase-item');
    
    if (showcaseItems.length > 0) {
        const showcaseObserver = new IntersectionObserver((entries) => {
                if (entry.isIntersecting) {
                    // Gradual parallax effects based on intersectionRatio
                    const ratio = entry.intersectionRatio;
                    const info = entry.target.querySelector('.project-info');
                    const videoCont = entry.target.querySelector('.video-container');
                    
                    if (info) info.style.transform = `translateY(${(1 - ratio) * 30}px)`;
                    if (videoCont) videoCont.style.transform = `scale(${1.15 - (ratio * 0.15)})`;

                    if (ratio > 0.3) {
                        entry.target.classList.add('active');
                        const video = entry.target.querySelector('video');
                        if (video && video.paused) video.play().catch(e => console.log('Autoplay blocked', e));
                    } else if (ratio < 0.2) {
                        entry.target.classList.remove('active');
                        const video = entry.target.querySelector('video');
                        if (video) video.pause();
                    }
                }
        }, {
            threshold: [0.1, 0.3, 0.5, 0.7, 0.9], // Multi-threshold for more granular tracking
            rootMargin: '0px'
        });

        showcaseItems.forEach(item => {
            showcaseObserver.observe(item);
            
            // Add video error handling to ensure images show through
            const video = item.querySelector('video');
            if (video) {
                video.addEventListener('error', () => {
                    console.warn('Video failed to load, falling back to image.');
                    video.style.opacity = '0'; // Hide broken video to show image behind
                });
                
                // Ensure video is visible only when playing or loaded
                video.addEventListener('playing', () => {
                    video.style.opacity = '1';
                });
            }
        });
    }

    // --- Portfolio Filtering Logic ---
    const filterBtns = document.querySelectorAll('.filter-btn');
    const portfolioCards = document.querySelectorAll('.portfolio-card-v2');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filter = btn.getAttribute('data-filter');

            portfolioCards.forEach(card => {
                const category = card.getAttribute('data-category');
                if (filter === 'all' || filter === category) {
                    card.style.display = 'block';
                    setTimeout(() => {
                        card.classList.add('active');
                    }, 10);
                } else {
                    card.classList.remove('active');
                    setTimeout(() => {
                        card.style.display = 'none';
                    }, 500);
                }
            });
        });
    });

    // Auto-play/pause videos in grid on hover
    portfolioCards.forEach(card => {
        const video = card.querySelector('.card-video');
        card.addEventListener('mouseenter', () => {
            if (video) video.play().catch(e => console.log('Autoplay blocked', e));
        });
        card.addEventListener('mouseleave', () => {
            if (video) {
                video.pause();
                video.currentTime = 0;
            }
        });
    });

    // --- Fullscreen Video Player Modal ---
    const videoModal = document.getElementById('video-player-modal');
    if (videoModal) {
        const modalVideo = videoModal.querySelector('.modal-main-video');
        const modalTitle = videoModal.querySelector('.modal-title');
        const modalDesc = videoModal.querySelector('.modal-description');
        const videoModalClose = document.querySelector('.video-modal-close');
        const videoModalOverlay = document.querySelector('.video-modal-overlay');

        const openVideoModal = (projectData) => {
            modalVideo.src = projectData.videoSrc;
            modalTitle.textContent = projectData.title;
            modalDesc.textContent = projectData.description;
            
            videoModal.classList.add('active');
            document.body.style.overflow = 'hidden';
            modalVideo.play().catch(e => console.log('Modal video play blocked', e));
        };

        const closeVideoModal = () => {
            videoModal.classList.remove('active');
            document.body.style.overflow = '';
            modalVideo.pause();
            modalVideo.src = '';
        };

        if (videoModalClose) videoModalClose.addEventListener('click', closeVideoModal);
        if (videoModalOverlay) videoModalOverlay.addEventListener('click', closeVideoModal);

        portfolioCards.forEach(card => {
            card.addEventListener('click', () => {
                const title = card.querySelector('h4').textContent;
                const videoSrc = card.querySelector('video source').src;
                const categoryMeta = card.querySelector('.card-meta').textContent;
                
                openVideoModal({
                    title: title,
                    description: `A premium ${categoryMeta} project showcasing cinematic excellence and professional storytelling.`,
                    videoSrc: videoSrc
                });
            });
        });

        showcaseItems.forEach(item => {
            item.addEventListener('click', () => {
                const title = item.querySelector('h3').textContent;
                const videoSrc = item.querySelector('video source').src;
                const desc = item.querySelector('.description').textContent;

                openVideoModal({
                    title: title,
                    description: desc,
                    videoSrc: videoSrc
                });
            });
        });
    }
});

// Client Auth Check & Auto-fill
async function checkClientAuth() {
    const token = localStorage.getItem('vp_token');
    if (!token) return;

    try {
        const res = await fetch('/api/client/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok) {
            const user = await res.json();
            
            // 1. Update Navbar
            const navPortal = document.getElementById('nav-portal-link');
            if (navPortal) {
                const isEs = document.getElementById('lang-es') && document.getElementById('lang-es').classList.contains('active');
                const pText = isEs ? 'Mi Portal' : 'My Portal';
                let avatarHtml = '';
                if (user.profileImage) {
                    avatarHtml = `<img src="${user.profileImage}" alt="${user.name}" class="profile-avatar" style="width:32px;height:32px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:8px; display:inline-block;" onerror="this.onerror=null; this.outerHTML='${user.name.charAt(0).toUpperCase()}';">`;
                } else {
                    avatarHtml = `<div class="profile-avatar" style="width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;background:var(--surface-light);color:var(--amber-start);font-weight:bold;font-size:0.9rem;vertical-align:middle;margin-right:8px;">${user.name.charAt(0).toUpperCase()}</div>`;
                }
                navPortal.innerHTML = `<a href="/project-status" style="display:flex;align-items:center;" class="hover-underline">${avatarHtml} ${pText}</a>`;
            }

            // 2. Update Booking Form
            const bookInfo = document.getElementById('logged-in-user-info-booking');
            if (bookInfo) {
                bookInfo.style.display = 'flex';
                document.getElementById('logged-in-name-booking').textContent = user.name;
                document.getElementById('logged-in-email-booking').textContent = user.email;
                const avaBook = document.getElementById('logged-in-avatar-booking');
                if(user.profileImage) avaBook.innerHTML = `<img src="${user.profileImage}" style="width:100%;height:100%;object-fit:cover;" onerror="this.onerror=null; this.parentElement.innerHTML='${user.name.charAt(0).toUpperCase()}';">`;
                else avaBook.innerHTML = user.name.charAt(0).toUpperCase();

                const bEmail = document.getElementById('book-email');
                if(bEmail) { bEmail.value = user.email; bEmail.readOnly = true; bEmail.style.opacity = '0.7'; }
                const bName = document.getElementById('book-name');
                if(bName) { bName.value = user.name; }
            }

            // 3. Update Project Form
            const projInfo = document.getElementById('logged-in-user-info-project');
            if (projInfo) {
                projInfo.style.display = 'flex';
                document.getElementById('logged-in-name-project').textContent = user.name;
                document.getElementById('logged-in-email-project').textContent = user.email;
                const avaProj = document.getElementById('logged-in-avatar-project');
                if(user.profileImage) avaProj.innerHTML = `<img src="${user.profileImage}" style="width:100%;height:100%;object-fit:cover;" onerror="this.onerror=null; this.parentElement.innerHTML='${user.name.charAt(0).toUpperCase()}';">`;
                else avaProj.innerHTML = user.name.charAt(0).toUpperCase();

                const pEmail = document.getElementById('proj-email');
                if(pEmail) { pEmail.value = user.email; pEmail.readOnly = true; pEmail.style.opacity = '0.7'; }
                const pName = document.getElementById('proj-name');
                if(pName) { pName.value = user.name; }
            }
        } else {
            localStorage.removeItem('vp_token');
        }
    } catch (e) {
        console.error('Auth Check Error', e);
    }
}
document.addEventListener('DOMContentLoaded', checkClientAuth);
