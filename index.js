// Referenz: https://gabrieltanner.org/blog/dicord-music-bot
// Discord V12 Docs: https://v12.discordjs.guide/voice/
// Embed Builder: https://autocode.com/tools/discord/embed-builder/
// Hot to Embed in Discord: https://discordjs.guide/popular-topics/embeds.html#using-the-embed-constructor

const Discord = require("discord.js")
const ytdl = require("ytdl-core")
const ytpl = require("ytpl")
const ytsr = require("ytsr")
const lib = require('lib')({token: process.env.STDLIB_SECRET_TOKEN});


const {prefix, token} = require("./config.json")

const queue = new Map() 
const client = new Discord.Client()

var dispatcher = null
var timeout = null


client.on('ready', () => {
  console.log(`Logged in as '${client.user.tag}'`)
  console.log('Ready!') 
  client.user.setActivity(`Prefix: ${prefix}`, {type: 'WATCHING'})
})

client.once('reconnecting', () => {
  console.log('Reconnecting!') 
}) 
client.once('disconnect', () => {
  console.log('Disconnect!') 
}) 

client.on("message", async message => {
    if (message.author.bot) return 
    if (!message.content.startsWith(prefix)) return 
    const serverQueue = queue.get(message.guild.id)
    handleUserInput(message, serverQueue)
  })

  // Checks which command was issued and calls the right method to continue 
  function handleUserInput(message, serverQueue){
    switch(message.content.split(" ")[0]){
      case `${prefix}ping`:
        const pinged = message.mentions.members.first() 
        if (pinged === undefined){
          message.reply(`Who do you want to ping?`)
          break
        }
        message.channel.send(`You've been summoned ${pinged}!`)
        break
      case `${prefix}play` | `${prefix}p`:
        execute(message, serverQueue)
        break
      case `${prefix}skip` | `${prefix}s`:
        skip(message, serverQueue)
        break
      case `${prefix}stop`:
        stop(message, serverQueue)
        break
      case `${prefix}pause`:
        pause(message, serverQueue)
        break
      case `${prefix}resume`:
        resume(message, serverQueue)
        break
      case `${prefix}remove` | `${prefix}r`:
        removeAtIndex(message, serverQueue)
        break
      case `${prefix}mute` | `${prefix}unmute`:
        muteAudio(message, serverQueue)
        break
      case `${prefix}queue` | `${prefix}q`:
        listQueue(message, serverQueue)
        break
      case `${prefix}np`:
        listCurrentPlayingSong(message, serverQueue)
        break
      case `${prefix}qloop` | `${prefix}queueloop`:
        loopCurrentSongQueue(message, serverQueue)
        break
      case `${prefix}loop`:
        loopCurrentSong(message, serverQueue)
        break
      case `${prefix}join`:
        join(message)
        break
      case `${prefix}leave`:
        leaveVoiceChannel(message, serverQueue)
        break
      case `${prefix}help`:
        help(message)
        break
      default:
        console.log(`[INFO] User: ${message.author.tag} used an invalid Command`)
        message.channel.send("You need to enter a valid command!")
        break
    }
  }
  
  // It checks if it's a YT-Link, YT-Playlist or a search-string and passes on the information to enqueueSongs() 
  async function execute(message, serverQueue) {
    const args = message.content.split(" ")
    
    let userInput = extractUserInput(args)
    
    const voiceChannel = message.member.voice.channel 
    if (!voiceChannel)
      return message.channel.send("You need to be in a voice channel to play music!") 

    const permissions = voiceChannel.permissionsFor(message.client.user) 
    
    if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
      return message.channel.send("I need the permissions to join and speak in your voice channel!") 
    }

    if(args.length > 2){
      const filter = await ytsr.getFilters(userInput)
      const filters = filter.get("Type").get("Video")

      console.log(`[INFO] Fetching Video Information from input`)    
      const searchResults = await ytsr(filters.url, {pages: 1})
      const songInfo = await ytdl.getInfo(searchResults.items[0].url)
      enqueueSongs(message, serverQueue, songInfo, false)
      return
    }

    try {
      console.log(`[INFO] Fetching Video Information`)
      const songInfo = await ytdl.getInfo(userInput) 
      enqueueSongs(message, serverQueue, songInfo, false)
      return
    } catch (error) {
      console.log(`[INFO] Video URL Invalid`)
    }

    try {
      console.log(`[INFO] Fetching Playlist Information`)
      const songInfo = await ytpl.getPlaylistID(userInput)
      enqueueSongs(message, serverQueue, songInfo, true)
      return
    } catch (error) {
      console.log(`[INFO] Playlist URL Invalid`)      
    }   
    message.channel.send("The song you requested can not be played :|")
  }

  // Helper function to extract the user input into a string
  function extractUserInput(args){
    let out = ""
    args.forEach(function (element,i) {
      if(i == 0) return
      out = out + `${element} `
    })
    return out
  }

  // Enqueues the song from the input 
  async function enqueueSongs(message, serverQueue, songInfo, isPlaylist){
    const voiceChannel = message.member.voice.channel

    var firstResult = null
    var song = null

    if(isPlaylist){
      firstResult = await ytpl(songInfo, {pages: 1})
    } else {
      song = {
        title: songInfo.videoDetails.title,
        url: songInfo.videoDetails.video_url,
        requestedBy: message.author.tag,
      } 
    }

    if(!serverQueue){

      var queueContruct = {
        textChannel: message.channel,
        voiceChannel: voiceChannel,
        connection: null,
        songs: [],
        volume: 5,
        playing: true,
        timeoutTimer: 3000,
        timeout: null,
        loopSong: false,
        loopSongQueue: false,
        currentSongQueue: [],
        currentSongQueueIndex: 2,
        isMuted: false
      } 

      queue.set(message.guild.id, queueContruct)

      if(isPlaylist) {
        pushSongsToQueue(message, firstResult, queueContruct)
        console.log(`[INFO] User: ${message.author.tag} added ${firstResult.items.length} songs to the queue`)
        message.channel.send(`${queueContruct.songs.length} songs have been added to the queue`)
      } else {
        queueContruct.songs.push(song)
        console.log(`[INFO] User: ${message.author.tag} added song: ${song.title} to the Queue`)
      }
      
      await joinVoice(voiceChannel, message, queueContruct)
      queueContruct.currentSong = await ytdl(song.url)

    } else {
      if(!client.voice.connections.size > 0){
        await joinVoice(voiceChannel, message, serverQueue)
      }

      if(isPlaylist){
        pushSongsToQueue(message, firstResult, serverQueue)
        console.log(`[INFO] User: ${message.author.tag} added ${firstResult.items.length} songs to the queue`)
        return message.channel.send(`${firstResult.items.length} songs have been added to the queue!`)
      } else {
        serverQueue.songs.push(song)
        console.log(`[INFO] User: ${message.author.tag} added song: ${song.title} to the Queue`)
        return message.channel.send(`**${song.title}** has been added to the queue!`) 
      }
    }   
  }

  // Pushes every song from a YT Playlist into the songqueue
  function pushSongsToQueue(message, firstResult, queue){
    firstResult.items.forEach(element => {
      const song = {
        title: element.title,
        url: element.url,
        requestedBy: message.author.tag,
      }
      queue.songs.push(song)
    })
  }

  // The bot joins the voicechannel and starts playing the first song 
  async function joinVoice(voiceChannel, message, queueContruct){
    try {
      console.log("[INFO] Joining Voicechannel")
      const connection = await voiceChannel.join() 
      queueContruct.connection = connection
      voiceChannel.guild.me.edit({mute: false})
      playFromURL(message, queueContruct.songs[0]) 
    } catch (err) {
      console.log(err) 
      queue.delete(message.guild.id) 
      return message.channel.send(err) 
    }
  } 

  // Main function to play the audio, accounts for song-looping and queue-looping and sets a timeout to leave if no further songs are added to the queue
  async function playFromURL(message, song) {
    const serverQueue = queue.get(message.guild.id) 
    
    if(timeout != null) {
      console.log(`[INFO] Clearing Timeout of ${serverQueue.timeoutTimer/1000}m`)
      clearTimeout(timeout)
    } 

    if (!song) {
      console.log(`[INFO] No more songs in Queue`)
      queue.delete(message.guild.id) 
      console.log(`[INFO] Setting Timeout to ${serverQueue.timeoutTimer/1000}m`)
      timeout = setTimeout(function(){
        leaveVoiceAfterXSeconds(message, serverQueue.timeoutTimer, false)
      }, serverQueue.timeoutTimer*100)
      return 
    }

      
    dispatcher = serverQueue.connection
      .play(ytdl(song.url, {filter: 'audioonly'}))
      .on('finish', () => {
        if(serverQueue.loopSongQueue){
          const index = serverQueue.currentSongQueueIndex
          if(index > serverQueue.currentSongQueue.length){
            serverQueue.currentSongQueueIndex = 1  
          }
          playFromURL(message, serverQueue.currentSongQueue[index-1])
          serverQueue.currentSongQueueIndex += 1
        } else if(serverQueue.loopSong) {
          playFromURL(message, serverQueue.songs[0])
        } else {
          serverQueue.songs.shift()
          playFromURL(message, serverQueue.songs[0]) 
        }
      })
      .on("error", error => {
        try {
          throw new Error();
        } catch {
          dispatcher.end()
          message.channel.send(`There was an error playing this song, skipping ahead `)
          console.error(error)
          return
        }
      })

    dispatcher.setVolumeLogarithmic(serverQueue.volume / 5) 
    if(!serverQueue.loopSong){
      console.log(`[INFO] Now playing: ${song.title} requested by ${song.requestedBy}`)
      serverQueue.textChannel.send(`Now playing: **${song.title}**`) 
    }
  }

  // Skips the song which is currently playing
  function skip(message, serverQueue) {
    if(!checkIfBotCanInteract(message, serverQueue, "skip")) return

    dispatcher.end()
    console.log(`[INFO] User: ${message.author.tag} skipped a Song`)
  }

  // Stops the bot from playing and clears the songqueue
  function stop(message, serverQueue) {
    if(!checkIfBotCanInteract(message, serverQueue, "stop")) return
    
    console.log(`[INFO] Stopped Playing Music and Cleared the Songqueue`)
    message.channel.send(`Cleared the queue and stopped playing`)
    clearServerQueue(serverQueue)
    dispatcher.end() 
  }

  // Pauses the player
  function pause(message, serverQueue){
    if(!checkIfBotCanInteract(message, serverQueue, "pause")) return

    console.log(`[INFO] Pausing song`)
    dispatcher.pause()
  }

  // Resumes the player
  function resume(message, serverQueue){
    if(!checkIfBotCanInteract(message, serverQueue, "resume")) return

    console.log(`[INFO] Resuming song`)
    dispatcher.resume()
  }

  // Removes the song in the queue at the given index
  function removeAtIndex(message, serverQueue){
    if (!message.member.voice.channel)
      return message.channel.send("You have to be in a voice channel to remove a song from the queue!") 
    if (!serverQueue)
      return message.channel.send("There is no song that I could remove!")

    const index = parseInt(message.content.split(" ")[1])

    if(isNaN(index) || index > serverQueue.songs.length){
      console.log(`[WARN] Invalid input for method removeAtIndex()`)
      return message.channel.send("Please enter a valid number to remove a song from the queue ")
    } else if(index == 1){
      console.log(`[WARN] Trying to remove playing song`)
      return message.channel.send(`You can't remove the song which is currently playing`)
    }
    console.log(`[INFO] Removing Song at Index: ${index}`)
    
    message.channel.send(`Removing **${serverQueue.songs[index-1].title}** from the queue`)
    serverQueue.songs.splice(index-1, index-1)
  }

  // Mutes the bot until unmuted, Mute is disabled automatically after skiping a song
  function muteAudio(message, serverQueue){   
    if(!checkIfBotCanInteract(message, serverQueue, "mute")) return

    serverQueue.isMuted = !serverQueue.isMuted
    if(serverQueue.isMuted){
      console.log(`[INFO] Muting audio output`)
      serverQueue.voiceChannel.guild.me.edit({mute: true})
      
    } else {
      console.log(`[INFO] Unmuting audio output`)
      serverQueue.voiceChannel.guild.me.edit({mute: false})
    }  
  }

  // Outputs the entire songqueue
  function listQueue(message, serverQueue){
    if(!serverQueue){
      console.log(`[INFO] No Songs in the Queue`)
      return message.channel.send(`There are no songs Playing atm`)
    }

    console.log(`[INFO] Listing the enqueued Song List: `)

    var out = "```"
    
    out = generateListOutputString(serverQueue, out)
    
    if(serverQueue.songs.length > 10){
      out = out + `NOTE: There are ${serverQueue.songs.length} songs in the Queue`
      console.log(`[INFO] Songs in Queue: ${serverQueue.songs.length}`)
    }
    out = out + '```'
    message.channel.send(`Songs in the Queue: \n${out}`)
  }

  // Outputs the name of the currently playing song 
  function listCurrentPlayingSong(message, serverQueue){
    if(!serverQueue){
      console.log(`[INFO] No Songs in the Queue`)
      return message.channel.send(`There are no songs Playing atm`)
    }

    console.log(`[INFO] Listing current playing song: ${serverQueue.songs[0].title} requested by ${serverQueue.songs[0].requestedBy}`)
    message.channel.send(`Currently playing: **${serverQueue.songs[0].title}**`)
  }

  // Loops the entire songqueue until disabled, at which point is skips the queue forward to the point, where the queue was stopped
  function loopCurrentSongQueue(message, serverQueue){
    if(!checkIfBotCanInteract(message, serverQueue, "loop")) return

    if(serverQueue.loopSong){
      serverQueue.loopSong = false
      message.channel.send("Disabled Song Looping")
    }


    serverQueue.loopSongQueue = !serverQueue.loopSongQueue
    console.log(`[INFO] Changed current SongQueue Loop Status to ${serverQueue.loopSongQueue}`)

    if(serverQueue.loopSongQueue){
      console.log(`[INFO] Looping current SongQueue`)
      message.channel.send(`Enabled SongQueue Looping` )

      serverQueue.currentSongQueue = serverQueue.songs
      serverQueue.currentSongQueueIndex = 2
    } else {
      message.channel.send(`Disabled songqueue Looping` )
      shiftSongQueueToIndex(serverQueue, serverQueue.currentSongQueueIndex - 1)
    }
  }

  // Loops the first song in the queue until disabled
  function loopCurrentSong(message, serverQueue){
    if(!checkIfBotCanInteract(message, serverQueue, "loop")) return
    
    if(serverQueue.loopSongQueue){
      serverQueue.loopSongQueue = false
      shiftSongQueueToIndex(serverQueue, serverQueue.currentSongQueueIndex - 1)
      message.channel.send("Disabled SongQueue Looping")
    }

    serverQueue.loopSong = !serverQueue.loopSong
    console.log(`[INFO] Changed Song Loop Status to ${serverQueue.loopSong}`)

    if(serverQueue.loopSong){
      console.log(`[INFO] Looping song: ${serverQueue.songs[0].title}`)
      message.channel.send(`Enabled Song Looping` )
    } else {
      message.channel.send(`Disabled Song Looping` )
    }
    
  }

  // The bot joins the voicechannel in which the user is in
  async function join(message){
    const voiceChannel = message.member.voice.channel
    if (!voiceChannel)
      return message.channel.send("You have to be in a voice channel to let the bot join a voice channel") 

    try {
      await voiceChannel.join()
      console.log(`[INFO] Joined a voice channel`)
      message.channel.send(`Joined the voice channel: ${message.member.voice.channel}`)
    } catch (err) {
      console.log(err) 
      return message.channel.send(err)
    }
  }

  // Method is responsible for leaving the voicechannel
  function leaveVoiceChannel(message, serverQueue){
    if (!message.member.voice.channel)
      return message.channel.send("You have to be in a voice channel to let me leave!") 
    
    leaveVoiceAfterXSeconds(message, 10, true)
   
    if(!serverQueue)
      return message.channel.send(`Leaving ${message.member.voice.channel}`)

    clearServerQueue(serverQueue)
    dispatcher.end()
    return message.channel.send(`Leaving ${message.member.voice.channel}`) 
  }

  // Guides the user on which commands can be used to interact with the bot
  async function help(message){
    console.log(`[INFO] Sending user Help`)
    message.author.send({embed: {
      color: 0x00d5ff,
      title: 'Music For Friends Guide',
      fields: [{
        name: 'Commands:',
        value: '➜ !p or !play - Search for YT Link or for keywords (f.e. !play https://www.youtube.com/watch?v=dQw4w9WgXcQ)\n➜ !s or !skip - Skip the currently playing song\n➜ !stop - Stops the music and clears the Musicqueue\n➜ !pause - Pauses the song\n➜ !resume - Resumues the song\n➜ !r or !remove - Removes the Song at given position (f.e. : !remove 4)\n➜ !mute or !unmute - Mutes/Unmutes the bot\n➜ !q or !queue - Shows the first 10 songs in the Queue\n➜ !np - Shows which song is playing at the moment\n➜ !qloop or !queueLoop - Loops/Unloops the Musicqueue \n➜ !loop - Loops/Unloops the currently playing song\n➜ !join - The bot joins your voicechannel\n➜ !leave - The bot leaves your voicechannel',
        },
      ],
      footer: {
        text: 'If the bot misbehaves, ask RotesBlatt#4578 for help',
      },}
    })
  }

  // Helper function
  function clearServerQueue(serverQueue){
    serverQueue.songs = []
    serverQueue.loopSong = false
    serverQueue.loopSongQueue = false
    serverQueue.currentSongQueue = []
  }

  // Sets a timeout depending on the input, so the bot can leave at given time
  function leaveVoiceAfterXSeconds(message, time, immediate){
    console.log(`[INFO] Leaving Voice Channel`)
    if(immediate) {
      message.guild.me.voice.channel.leave()
      return
    }
    if(!client.voice.connections.size > 0){
      console.log(`[INFO] Already Disconnected`)
      return
    }
    timeout = setTimeout(function () {
      message.guild.me.voice.channel.leave()
    }, time)
  }

  // Helper function
  function shiftSongQueueToIndex(serverQueue, index){
    serverQueue.songs.forEach(function (i) {
      if(i >= index) return
      serverQueue.songs.shift()
      i = i + 1
    })
  }
  
  // Helper function
  function generateListOutputString(serverQueue, input){
    let out = input
    serverQueue.songs.forEach(function (element,i) {
      if(i > 9) return
      console.log(`${i+1}. ${element.title}`)
      out = `${out}${i+1}. ${element.title}\n`
    });
    return out
  }

  // Helper function
  function checkIfBotCanInteract(message, serverQueue, insert){
    if (!message.member.voice.channel){
      message.channel.send(`You have to be in a voice channel to ${insert} the music!`) 
      return false
    }
      
    if (!serverQueue){
      message.channel.send(`There is no song that I could ${insert}!`)
      return false
    }
      
    return true
  }

client.login(token)


// TODO: Download attached files (if mp3) and save them to be played later (https://stackoverflow.com/questions/51550993/download-file-to-local-computer-sent-attatched-to-message-discord/51565540)
// TODO: Play downloaded mp3's via command (search for name input?)
// TODO: Figure out how to play Songs from Spotify
// TODO: Clip abspielen bevor der Bot den Channel verlässt (https://www.youtube.com/watch?v=r5sTTlph2Vk)
// TODO: Make every message to the channel an embed output