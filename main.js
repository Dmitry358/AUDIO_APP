// 🔧 Configura Firebase (inserisci i tuoi dati da Firebase)
const firebaseConfig = {
  apiKey: "AIzaSyBrUkHbnapCjd5T_wBl6xiD5PIcJGJlVpk",
  authDomain: "myaudio-40fad.firebaseapp.com",
  databaseURL: "https://myaudio-40fad-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "myaudio-40fad",
  storageBucket: "myaudio-40fad.firebasestorage.app",
  messagingSenderId: "822697075852",
  appId: "1:822697075852:web:9a172d61b6a8ab4b9987a9"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const servers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
  ],
};

let localStream = null;
let remoteStream = null;
let peerConnection = null;

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

async function setupLocalMedia() {
  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideo.srcObject = localStream;
    } catch (error) {
      alert("Errore nell'accesso a webcam o microfono: " + error.message);
      throw error;
    }
  }
}

// Funzione per aggiungere candidati ICE su Firebase
function sendIceCandidate(roomRef, candidate) {
  if (candidate) {
    const candidatesRef = roomRef.child('candidates');
    candidatesRef.push(candidate.toJSON());
  }
}

// Listener per candidati ICE da Firebase
function listenForIceCandidates(roomRef, pc) {
  const candidatesRef = roomRef.child('candidates');
  candidatesRef.on('child_added', async snapshot => {
    const candidate = snapshot.val();
    if (candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("Candidato ICE aggiunto:", candidate);
      } catch (e) {
        console.error("Errore aggiungendo candidato ICE:", e);
      }
    }
  });
}

document.getElementById('startCall').onclick = async () => {
  try {
    await setupLocalMedia();

    const roomRef = database.ref('rooms').push();
    const roomId = roomRef.key;
    console.log("Creazione stanza con ID:", roomId);
    alert("ID stanza: " + roomId);

    peerConnection = new RTCPeerConnection(servers);

    // Aggiungi tracce locali
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;

    peerConnection.ontrack = event => {
      event.streams[0].getTracks().forEach(track => {
        remoteStream.addTrack(track);
      });
    };

    // Gestione candidati ICE: invio su Firebase
    peerConnection.onicecandidate = event => {
      if (event.candidate) {
        sendIceCandidate(roomRef, event.candidate);
      }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Salva offer su Firebase
    await roomRef.set({ offer: { type: offer.type, sdp: offer.sdp } });
    console.log("Offerta scritta su Firebase");

    // Ascolta risposta e setta remote description
    roomRef.on('value', async snapshot => {
      const data = snapshot.val();
      if (!peerConnection.currentRemoteDescription && data?.answer) {
        console.log("Risposta ricevuta:", data.answer);
        const answerDesc = new RTCSessionDescription(data.answer);
        await peerConnection.setRemoteDescription(answerDesc);
      }
    });

    // Ascolta candidati ICE in arrivo dal joiner
    listenForIceCandidates(roomRef, peerConnection);

  } catch (error) {
    console.error("Errore durante creazione stanza:", error);
  }
};

document.getElementById('joinCall').onclick = async () => {
  try {
    await setupLocalMedia();

    const roomId = document.getElementById('roomIdInput').value.trim();
    if (!roomId) {
      alert("Inserisci un ID stanza valido");
      return;
    }

    const roomRef = database.ref('rooms/' + roomId);

    const snapshot = await roomRef.get();
    const data = snapshot.val();

    console.log("Dati stanza trovati:", data);

    if (!data) {
      alert("Stanza non trovata");
      return;
    }

    peerConnection = new RTCPeerConnection(servers);

    // Aggiungi tracce locali
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;

    peerConnection.ontrack = event => {
      event.streams[0].getTracks().forEach(track => {
        remoteStream.addTrack(track);
      });
    };

    // Gestione candidati ICE: invio su Firebase
    peerConnection.onicecandidate = event => {
      if (event.candidate) {
        sendIceCandidate(roomRef, event.candidate);
      }
    };

    // Setta offer come remote description
    const offerDesc = new RTCSessionDescription(data.offer);
    await peerConnection.setRemoteDescription(offerDesc);

    // Crea risposta e setta local description
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    // Aggiorna Firebase con risposta
    await roomRef.update({ answer: { type: answer.type, sdp: answer.sdp } });
    console.log("Risposta inviata su Firebase");

    // Ascolta candidati ICE in arrivo dal creator
    listenForIceCandidates(roomRef, peerConnection);

  } catch (error) {
    console.error("Errore durante unione alla stanza:", error);
  }
};
