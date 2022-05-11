// Referenz: https://gabrieltanner.org/blog/dicord-music-bot
// Discord V12 Docs: https://v12.discordjs.guide/voice/
// Embed Builder: https://autocode.com/tools/discord/embed-builder/
// Hot to Embed in Discord: https://discordjs.guide/popular-topics/embeds.html#using-the-embed-constructor

const Discord = require("discord.js")
const ytdl = require("ytdl-core")
const ytpl = require("ytpl")
const ytsr = require("ytsr")


const {prefix, token} = require("./config.json")

const queue = new Map() 
const client = new Discord.Client()

var dispatcher = null
var timeout = null

const COLOR_ERROR = 0xff0000
const COLOR_INFO = 0x00d5ff

// Triggers once when starting the bot
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

// Triggers when receiving a message in a voicechannel
client.on("message", async message => {
    if (message.author.bot) return 
    if (!message.content.startsWith(prefix)) return 
    const serverQueue = queue.get(message.guild.id)
    handleUserInput(message, serverQueue)
  })

  // Checks which command was issued and calls the right method to continue 
  function handleUserInput(message, serverQueue){
    switch(message.content.split(" ")[0]){
      case `${prefix}p`:
      case `${prefix}play`:
        execute(message, serverQueue)
        break
      case `${prefix}s`:
      case `${prefix}skip`:
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
      case `${prefix}r`:
      case `${prefix}remove`:
        removeAtIndex(message, serverQueue)
        break
      case `${prefix}unmute`:
      case `${prefix}mute`:
        muteAudio(message, serverQueue)
        break
      case `${prefix}q`:
      case `${prefix}queue`:
        listQueue(message, serverQueue)
        break
      case `${prefix}np`:
        listCurrentPlayingSong(message, serverQueue)
        break
      case `${prefix}queueloop`:
      case `${prefix}qloop`:
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
      case `${prefix}reset`:
        softResetBot(message, serverQueue)
        break
      default:
        console.log(`[INFO] User: ${message.author.tag} used an invalid Command`)
        const embed = createEmbed(COLOR_ERROR, 'Error', 'You need to enter a valid command!')
        message.channel.send({embed})
        break
    }
  }
  
  // It checks if it's a YT-Link, YT-Playlist or a search-string and passes on the information to enqueueSongs() 
  async function execute(message, serverQueue) {
    const args = message.content.split(" ")
    
    let userInput = extractUserInput(args)
    
    const voiceChannel = message.member.voice.channel 
    if (!voiceChannel){
      const embed = createEmbed(COLOR_ERROR, 'Error', 'You need to be in a voice channel to play music!')
      return message.channel.send({embed}) 
    }


    const permissions = voiceChannel.permissionsFor(message.client.user) 
    
    if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
      const embed = createEmbed(COLOR_ERROR, 'Error', 'I need the permissions to join and speak in your voice channel!')
      return message.channel.send({embed}) 
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
    
    const embed = createEmbed(COLOR_ERROR, 'Error', 'The song you requested can not be played :|')
    message.channel.send({embed})
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
        const embed = createEmbed(COLOR_INFO, 'Info', `${queueContruct.songs.length} songs have been added to the queue` )
        message.channel.send({embed})
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
        
      } else {
        serverQueue.songs.push(song)
        console.log(`[INFO] User: ${message.author.tag} added song: ${song.title} to the Queue`)
        const embed = createEmbed(COLOR_INFO, 'Info', `**${song.title}** has been added to the queue!`)
        return message.channel.send({embed})
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
      console.log(`[INFO] Clearing Timeout of ${serverQueue.timeoutTimer/600}m`)
      clearTimeout(timeout)
    } 

    if (!song) {
      console.log(`[INFO] No more songs in Queue`)
      queue.delete(message.guild.id) 
      console.log(`[INFO] Setting Timeout to ${serverQueue.timeoutTimer/600}m`)
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
          const embed = createEmbed(COLOR_ERROR, 'Error', 'There was an error playing this song, skipping ahead')
          message.channel.send({embed})
          console.error(error)
          return
        }
      })

    dispatcher.setVolumeLogarithmic(serverQueue.volume / 5) 
    if(!serverQueue.loopSong){
      console.log(`[INFO] Now playing: ${song.title} requested by ${song.requestedBy}`)
      const embed = createEmbed(COLOR_INFO, 'Info', `Now playing: **${song.title}** requested by ${song.requestedBy}`)
      serverQueue.textChannel.send({embed}) 
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
    const embed = createEmbed(COLOR_INFO, 'Info', `Cleared the queue and stopped playing`)
    message.channel.send({embed})
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
    if(!checkIfBotCanInteract(message, serverQueue, "remove")) return

    const index = parseInt(message.content.split(" ")[1])

    if(isNaN(index) || index > serverQueue.songs.length){
      console.log(`[WARN] Invalid input for method removeAtIndex()`)
      const embed = createEmbed(COLOR_ERROR, 'Error', 'Please enter a valid number to remove a song from the queue')
      return message.channel.send({embed})
    } else if(index == 1){
      console.log(`[WARN] Trying to remove playing song`)
      const embed = createEmbed(COLOR_ERROR, 'Error', "You can't remove the song which is currently playing")
      return message.channel.send({embed})
    }
    console.log(`[INFO] Removing Song at Index: ${index}`)
    serverQueue.songs.splice(index-1, index-1)
    const embed = createEmbed(COLOR_INFO, 'Info', `Removing **${serverQueue.songs[index-1].title}** from the queue`)
    message.channel.send({embed})
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
      const embed = createEmbed(COLOR_ERROR, 'Error', 'There are no songs Playing atm')
      return message.channel.send({embed})
    }

    console.log(`[INFO] Listing the enqueued Song List: `)

    // TODO: Embed the queue for the output
    let out = generateListOutputString(serverQueue, "")
    
    
    if(serverQueue.songs.length > 10){
      out = out + `NOTE: There are ${serverQueue.songs.length} songs in the Queue`
      console.log(`[INFO] Songs in Queue: ${serverQueue.songs.length}`)
    }

    const embed = createEmbed(COLOR_INFO, 'Songs in the queue:', `${out}`)
    message.channel.send({embed})
  }

  // Outputs the name of the currently playing song 
  function listCurrentPlayingSong(message, serverQueue){
    if(!serverQueue){
      console.log(`[INFO] No Songs in the Queue`)
      const embed = createEmbed(COLOR_ERROR, 'Error', 'There are no songs Playing atm')
      return message.channel.send({embed})
    }

    const embed = createEmbed(COLOR_INFO, 'Info', `${serverQueue.songs[0].title} requested by @${serverQueue.songs[0].requestedBy}`)
    message.channel.send({embed})

    console.log(`[INFO] Listing current playing song: ${serverQueue.songs[0].title} requested by ${serverQueue.songs[0].requestedBy}`)
  }

  // Loops the entire songqueue until disabled, at which point is skips the queue forward to the point, where the queue was stopped
  function loopCurrentSongQueue(message, serverQueue){
    if(!checkIfBotCanInteract(message, serverQueue, "loop")) return

    if(serverQueue.loopSong){
      serverQueue.loopSong = false
      const embed = createEmbed(COLOR_INFO, 'Info', 'Disabled Song Looping')
      message.channel.send({embed})
    }


    serverQueue.loopSongQueue = !serverQueue.loopSongQueue
    console.log(`[INFO] Changed current SongQueue Loop Status to ${serverQueue.loopSongQueue}`)

    if(serverQueue.loopSongQueue){
      console.log(`[INFO] Looping current SongQueue`)
      const embed = createEmbed(COLOR_INFO, 'Info', 'Enabled SongQueue Looping')
      message.channel.send({embed})

      serverQueue.currentSongQueue = serverQueue.songs
      serverQueue.currentSongQueueIndex = 2
    } else {
      const embed = createEmbed(COLOR_INFO, 'Info', 'Disabled songqueue Looping')
      message.channel.send({embed})
      shiftSongQueueToIndex(serverQueue, serverQueue.currentSongQueueIndex - 1)
    }
  }

  // Loops the first song in the queue until disabled
  function loopCurrentSong(message, serverQueue){
    if(!checkIfBotCanInteract(message, serverQueue, "loop")) return
    
    if(serverQueue.loopSongQueue){
      serverQueue.loopSongQueue = false
      shiftSongQueueToIndex(serverQueue, serverQueue.currentSongQueueIndex - 1)
      const embed = createEmbed(COLOR_INFO, 'Info', 'Disabled songqueue Looping')
      message.channel.send({embed})
    }

    serverQueue.loopSong = !serverQueue.loopSong
    console.log(`[INFO] Changed Song Loop Status to ${serverQueue.loopSong}`)

    if(serverQueue.loopSong){
      console.log(`[INFO] Looping song: ${serverQueue.songs[0].title}`)
      const embed = createEmbed(COLOR_INFO, 'Info', 'Enabled Song Looping')
      message.channel.send({embed})
    } else {
      const embed = createEmbed(COLOR_INFO, 'Info', 'Disabled Song Looping')
      message.channel.send({embed})
    }
    
  }

  // The bot joins the voicechannel in which the user is in
  async function join(message){
    const voiceChannel = message.member.voice.channel
    if (!voiceChannel){
      const embed = createEmbed(COLOR_ERROR, 'Error', 'You have to be in a voice channel to let the bot join a voice channel')
      return message.channel.send({embed})
    }
       

    try {
      await voiceChannel.join()
      console.log(`[INFO] Joined a voice channel`)
      const embed = createEmbed(COLOR_INFO, 'Info', `Joined voice channel: ${message.member.voice.channel}`)
      message.channel.send({embed})
    } catch (err) {
      console.log(err) 
      const embed = createEmbed(COLOR_ERROR, 'Error', `${err}`)
      return message.channel.send({embed})
    }
  }

  // Method is responsible for leaving the voicechannel
  function leaveVoiceChannel(message, serverQueue){
    if (!message.member.voice.channel){
      const embed = createEmbed(COLOR_ERROR, 'Error', 'You have to be in a voice channel to let me leave!')
      return message.channel.send({embed})
    }
       
    
    leaveVoiceAfterXSeconds(message, 10, true)
    const embed = createEmbed(COLOR_INFO, 'Info', `Leaving ${message.member.voice.channel}`)
    if(!serverQueue){
      return message.channel.send({embed})
    }

    clearServerQueue(serverQueue)
    dispatcher.end()
    return message.channel.send({embed}) 
  }

  // Guides the user on which commands can be used to interact with the bot
  async function help(message){
    console.log(`[INFO] Sending user Help`)
    message.author.send({embed: {
      color: COLOR_INFO,
      title: 'Music For Friends Guide',
      fields: [
        {
          name: 'Commands:',
          value: '➜ !p or !play - Search for YT Link or for keywords (f.e. !play https://www.youtube.com/watch?v=dQw4w9WgXcQ)\n➜ !s or !skip - Skip the currently playing song\n➜ !stop - Stops the music and clears the Musicqueue\n➜ !pause - Pauses the song\n➜ !resume - Resumues the song\n➜ !r or !remove - Removes the Song at given position (f.e. : !remove 4)\n➜ !mute or !unmute - Mutes/Unmutes the bot\n➜ !q or !queue - Shows the first 10 songs in the Queue\n➜ !np - Shows which song is playing at the moment\n➜ !qloop or !queueLoop - Loops/Unloops the Musicqueue \n➜ !loop - Loops/Unloops the currently playing song\n➜ !join - The bot joins your voicechannel\n➜ !leave - The bot leaves your voicechannel',
          inline: true  
        },
      ],
      footer: {
        text: 'If the bot misbehaves, ask RotesBlatt#4578 for help',
      },}
    })
  }

  function softResetBot(message, serverQueue){
    console.log(`[INFO] Resetting Bot`)

    clearServerQueue(serverQueue)
    stop(message, serverQueue)
    leaveVoiceAfterXSeconds(message, 0, true)

    const embed = createEmbed(COLOR_INFO, 'Info', 'Resetting ...')
    message.channel.send({embed})
      .then(msg => client.destroy())
      .then(() => client.login(token))
    console.log("here")
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
      const embed = createEmbed(COLOR_ERROR, 'Error', `You have to be in a voice channel to ${insert} the music!`)
      message.channel.send({embed})  
      return false
    }
    
    if (!serverQueue){
      const embed = createEmbed(COLOR_ERROR, 'Error', `There is no song that I could ${insert}!`)
      message.channel.send({embed}) 
      return false
    }
      
    return true
  }

  // Creates a basic embed with a given color, name and text
  function createEmbed(color, name, value){
    return embed = {
      color: color,
      fields: [
        {
          name: `${name}`,
          value: `${value}`,
          inline: true,
        },
      ],
    }
  }

client.login(token)


// TODO: Figure out how to play Songs from Spotify
// TODO: Clip abspielen bevor der Bot den Channel verlässt (https://www.youtube.com/watch?v=r5sTTlph2Vk)
// TODO: Reset command, which restarts the bot (opens a script which executes commands on the command line)
// TODO: Show the at which point (timestamp) when using !np