import React from "react"
import { NavigatorIOS, View } from "react-native"
import { createFragmentContainer, graphql } from "react-relay"

import SwitchBoard from "lib/NativeModules/SwitchBoard"

import { Flex } from "../Elements/Flex"
import { Icon20 } from "../Elements/Icon"

import { BiddingThemeProvider } from "../Components/BiddingThemeProvider"
import { BidGhostButton, Button } from "../Components/Button"
import { Container } from "../Components/Containers"
import { Markdown } from "../Components/Markdown"
import { Timer } from "../Components/Timer"
import { Title } from "../Components/Title"

import { BidResult_sale_artwork } from "__generated__/BidResult_sale_artwork.graphql"

const SHOW_TIMER_STATUSES = ["WINNING", "OUTBID", "RESERVE_NOT_MET"]

interface Bid {
  display: string
  cents: number
}

interface BidResultProps {
  sale_artwork: BidResult_sale_artwork
  winning: boolean
  status: string
  message_header?: string
  message_description_md?: string
  suggested_next_bid?: Bid
  navigator: NavigatorIOS
}

export class BidResult extends React.Component<BidResultProps> {
  onPressBidAgain = () => {
    // pushing to MaxBidScreen creates a circular relay reference but this works
    // TODO: correct the screen transision animation
    this.props.navigator.popToTop()
  }

  exitBidFlow = async () => {
    await SwitchBoard.dismissModalViewController(this)
    if (this.props.status === "LIVE_BIDDING_STARTED") {
      SwitchBoard.presentModalViewController(this, `/auction/${this.props.sale_artwork.sale.id}`)
    }
  }

  render() {
    const { live_start_at, end_at } = this.props.sale_artwork.sale

    // non-live sale doesn't have live_start_at so bidding is open until end time
    if (this.props.winning) {
      return (
        <BiddingThemeProvider>
          <Container mt={6}>
            <View>
              <Flex alignItems="center">
                <Icon20 source={require("../../../../../images/circle-check-green.png")} />
                <Title m={4}>You're the highest bidder</Title>
                <Timer liveStartsAt={live_start_at} endsAt={end_at} />
              </Flex>
            </View>
            <BidGhostButton text="Continue" onPress={this.exitBidFlow} />
          </Container>
        </BiddingThemeProvider>
      )
    } else {
      const bidAgain = SHOW_TIMER_STATUSES.indexOf(this.props.status) > -1
      const nextBid = (this.props.suggested_next_bid || this.props.sale_artwork.minimum_next_bid).display

      return (
        <BiddingThemeProvider>
          <Container mt={6}>
            <View>
              <Flex alignItems="center">
                <Icon20 source={require("../../../../../images/circle-x-red.png")} />
                <Title m={4}>{this.props.message_header}</Title>
                <Markdown>{this.props.message_description_md}</Markdown>
                {bidAgain && <Timer liveStartsAt={live_start_at} endsAt={end_at} />}
              </Flex>
            </View>
            {bidAgain ? (
              <Button text={`Bid ${nextBid} or more`} onPress={() => this.onPressBidAgain()} />
            ) : (
              <BidGhostButton text="Continue" onPress={this.exitBidFlow} />
            )}
          </Container>
        </BiddingThemeProvider>
      )
    }
  }
}

export const BidResultScreen = createFragmentContainer(
  BidResult,
  graphql`
    fragment BidResult_sale_artwork on SaleArtwork {
      minimum_next_bid {
        amount
        cents
        display
      }
      sale {
        live_start_at
        end_at
        id
      }
    }
  `
)
